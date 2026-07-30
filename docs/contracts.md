# データ契約（BFF / DB）

Web の Server Action がそのまま正。ここに書いてあるのは**間違えても型エラーにならず、静かにデータが壊れる**ものだけ。

## 単位

| 値 | 単位 | 注意 |
|---|---|---|
| `fundsArray[].funds` | **コインの枚数** | 金額 = 総和 **× 100**。円として扱うと 1/100 になる（本家 `MachineAndFundsList.jsx`） |
| `collect_funds.date` | **JST 深夜 0 時の epoch（ミリ秒）** | `src/shared/date.ts` の `getEpochTimeInSeconds(y, m, d)` で組み立てる |

`getEpochTimeInSeconds` は**名前に反してミリ秒を返す**（`Date.UTC(y, m-1, d) - 32_400_000`）。Web の `src/functions/makeDate/date.js` からのコピーなので、直すときは両方同時に直す。

DatePicker が返す `Date` の `getTime()` をそのまま送ると端末 TZ 依存で 1 日ずれる。年月日だけ取り出して `toJstMidnightEpoch()` を通すこと。

## 文字列の値

綴りを 1 文字間違えると読み側の `===` が外れて、エラーにならないまま機能が死ぬ。

- `collectMethod`: `"machines" | "total"` — ⚠️ **`"machine"` は誤り**（実際にこれで壊れた）
- `role`: `"admin" | "collecter" | "viewer"` — ⚠️ **`collector` ではなく `collecter`**

## 省略すると既定値で潰されるフィールド

Server Action が `UPDATE`（部分更新ではない）なので、送らなかった列は既定値で上書きされる。

**`updateStockState`** — 4 項目を必ず全部送る。

```js
// laundryState/action.js
extra_stocks:     extra_stocks ?? [],
stock_thresholds: stock_thresholds ?? { detergent: 1, softener: 1 },
```

`{ detergent, softener }` だけ送ると、**追加在庫が全消去され警告ラインが初期値に戻る**。

**店舗の更新** — `images` を送らないと空配列で上書きされる。保存時は必ず現在の配列をそのまま送る。

## 店舗画像

`laundry_store.images` の 1 要素は `{ url, path }`。`path` は Storage 上のファイル名で、削除に要る。

**アップロードは 2 段構え。** 実体は BFF を通らない。

1. `POST /api/v1/stores/images/signed-url` に `{ filename, contentType }` を送る（小さな JSON）
2. 返ってきた `signedUrl` へ**端末から直接** `PUT`（`content-type` ヘッダ + 生のバイト列）

削除は `DELETE /api/v1/stores/images` に `{ path }`（実体が小さいので BFF 経由のまま）。

- ⚠️ **実体を BFF に通さない。** Vercel のサーバーレス関数はリクエストボディが
  **4.5MB を超えると関数に届く前に**弾く。iPhone の写真は `quality: 0.8` でも 2〜5MB に
  なるので現実的に踏む。しかも拒否がアップロード途中の接続切断として現れるため、
  端末には **413 すら返らず** `fetch` の例外（「通信できませんでした」）しか出ず、
  電波のせいだと誤解する。実際にこれで詰まった
- ⚠️ **`POST /api/v1/stores/images`（multipart で実体を送る旧経路）は残してあるが
  アプリからは使わない。** 上の 4.5MB に当たる。ルート内の 10MB チェックは
  そこまで到達しないので意味を持たない
- ⚠️ **署名付き URL の有効期限は 2 時間。** 貰ってすぐ使う。画面を開いた時点で
  先に取っておくような作りにしない
- ⚠️ **生のバイト列で `PUT` する。`FormData` で送らない。** 署名付き URL は body が
  FormData だとフィールド名の解釈が実装依存になる。native は `file://` を `fetch` して
  `arrayBuffer()`、web は picker が返した `File` をそのまま body にする
- ⚠️ **`x-upsert: false` のまま使う。** ファイル名が時刻 + uuid で衝突しないので
  上書きを許す理由が無く、許すと既存の画像を差し替えられる
- ⚠️ **Storage と DB は別操作。** この API は実体を置く／消すだけで `laundry_store.images` は触らない。DB 側は店舗の `PATCH` に配列ごと送って反映する
- ⚠️ **削除は保存が通ってから。** 先に実体を消すと、保存をやめたときに写真だけ失う
- ⚠️ **保存に失敗したらアップロード済みを消して巻き戻す**（本家 `useStoreSubmit.js` と同じ）
- 受け付けるのは jpeg / png、10MB まで。ファイル名は `${Date.now()}_${uuid}.${ext}`
- ⚠️ **`filename` の検証は BFF の `signed-url` ルートが唯一の防波堤。** Server Action 側は
  検証していないので、`..` や `/` を通すと `laundry/` の外へ書けてしまう

## テーブルの辿り方

- ⚠️ **`collect_funds` に `organization_id` は無い。** 組織で絞るには
  `laundry_store` から店舗 ID を引いて `laundryId IN (...)` で辿る（本家
  `getOrgCollectFundsInPeriod` と同じ）。`organization_id` で引くと PostgREST が
  42703 を返すが、**エラーを見ていないと「0 件」と区別が付かない**。
  実際に集金リマインダの Edge Function がこれで壊れていた（集金済みでも
  「まだ登録がありません」と通知が飛ぶ状態だった）
- `laundry_state` は `laundryId` で店舗に紐づき、`laundryName` を自分で持っている
  （通知の文面などで店舗名が要るだけなら `laundry_store` を引かなくてよい）

## 集計の定義

- ホームの「1 回あたり平均」= **月の集金金額 ÷ 集金回数**。`storeCount`（その月に回った店舗数）で割らない。本家 `SalesCardClient.jsx` の `FundsDisplay` と同じ式
- `MonthlyPoint.storeCount` は「何店舗を回ったか」用。`plan.storeCount`（組織の現在の店舗数）とは別物で、過去の月では一致しない

## エンドポイントの癖

- `GET /funds/chart` の `to` は**排他**（`lt`）。その月を含めたいなら翌月 1 日を渡す
- `GET /funds/summary/monthly` は前年同月比のため**過去 2 年固定**。任意期間は `/funds/chart?groupBy=month`（`byStore` 付き）を使う
- ⚠️ **`GET /funds` の `offset` + `limit` は「直近 2 か月」しか返さない。** `getOrgCollectFundsPaginated` が `startEpoch = changeEpocFromNowYearMonth(-2)` を固定しているため、`offset` をいくら進めてもそれより古いデータには**絶対に届かない**。全件を見せる画面では使わないこと（`useFundList` がこれ）
- 売上履歴は `GET /funds?from=0&order=&asc=`（`to` は省略＝全期間）を使う。`getOrgCollectFundsInPeriod` は期間の下限が無く、**`ORDER BY` もサーバで効く**。`useFundHistory` がこれ
- ⚠️ **並び替えの対象を期間で絞らない。** 期間を区切って取ると「売上が高い順」の先頭がその期間の中の最高額になり、全期間の最高額ではなくなる。一度に出す件数を絞るのは**受け取ったあと**（`historyRows.ts` の `limit`）で、取得範囲とは別の話

## プッシュ通知

- `profiles.notification_prefs` は **jsonb で、列ごと置き換わる。** 部分更新のつもりで
  一部のキーだけ書くと、残りが消えて既定値に戻る（`updateStockState` と同じ罠）。
  BFF の `updateNotificationPrefs` が現在値とマージしてから書いている
- 既定値は `{ collectReminder: true, lowStock: true, machineBreak: true, reminderHour: 8 }`。
  ⚠️ **送信側は「キーが無い＝有効」として扱う。** 設定を一度も触っていない人にも届かせるため
- `reminderHour` は **0〜23 の JST**。Edge Function が毎時起動して現在の JST 時刻と
  突き合わせるので、範囲外の値を入れると**永久に一致せず通知が止まる**（BFF 側で弾いている）
- 通知の `data.url` は **expo-router のパス**。送信側（Edge Function / `utils/push/send.js`）で
  組み立てている。⚠️ 画面のパスを変えたら送信側も直すこと。存在しないパスでも例外にならず、
  タップしても何も起きないだけになる。⚠️ `(tabs)` はグループなので URL に現れない
- `device_tokens.expo_token` は **UNIQUE**。同じ端末を別ユーザーが使うと行の `user_id` を
  付け替える必要があるので、登録は service client で行う（RLS 下では他人の行を更新できない）
- ⚠️ **ログアウトはトークン解除の「後」に行う。** 先にサインアウトすると 401 で行が残り、
  端末を引き継いだ別のユーザーに前の組織の集金予定が届く

## アプリ内課金（StoreKit）

- **商品 ID は 2 リポジトリに同じ文字列を持っている。** `src/billing/products.ts` と Web の
  `src/functions/applePlans.js`。片方だけ直すと**購入は成立するのにプランが上がらない**
  （サーバの `PLAN_BY_PRODUCT_ID` の引きが `undefined` になり free 扱いになる）。型エラーは出ない
- ⚠️ **商品 ID は App Store Connect で一度作ると変更も再利用もできない。** 作る前に確定させる
- `purchase.purchaseToken` は iOS では **JWS 文字列**（Android の purchaseToken とは別物）。
  これをそのまま `POST /billing/apple/verify` の `jws` に入れる
- ⚠️ **検証（200）が返ってから `finishTransaction()` を呼ぶ。** 先に閉じると StoreKit が
  その取引を二度と返さなくなり、検証に失敗した購入が復元不能になる
- ⚠️ **復元では `finishTransaction()` を呼ばない。** 対象は既に完了済みの取引
- 購入時に `appAccountToken` へ**組織 ID**（uuid）を載せている。初回購入の Server Notification が
  verify より先に届いたとき、サーバが組織を特定できる唯一の手掛かりになる
- `organizations.plan_source` は `'stripe' | 'apple' | null`。**null = 有料契約なし。**
  Stripe と Apple を同じ組織で同時に生かさない（双方向に 409 で弾いている）
- ⚠️ **価格を文字列で持たない。** 表示は StoreKit の `displayPrice` だけ

## 既知の未対応

- 非 admin が他人の集金データを編集すると、403 ではなく**0 行更新の 200** が返る。UI 側で `myRole` を見て出し分けている
- Apple サインインは**有効化済み・実機で確認済み**。Supabase の Apple プロバイダの
  Client IDs に `com.collecie.app`（bundle ID）を入れるだけで通る。
  ⚠️ **Services ID も `.p8` の秘密鍵も要らない。** アプリは `signInWithIdToken` の
  native フローで、Supabase は identityToken の `aud`（= bundle ID）が Client IDs に
  あるかを見るだけ。あれらが要るのは Web のリダイレクト OAuth（`signInWithOAuth`）の
  ときだけで、Web 側は Google と GitHub しか使っていない
- ⚠️ **`@privaterelay.appleid.com` のアドレスを弾かないこと。** 「メールを非公開」を
  選んだユーザーに Apple が割り当てる実在のアドレス。弾くと Guideline 4.8 に触れる
