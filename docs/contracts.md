# データ契約（BFF / DB）

Web の Server Action がそのまま正。ここに書いてあるのは**間違えても型エラーにならず、静かにデータが壊れる**ものだけ。

## 単位

| 値 | 単位 | 注意 |
|---|---|---|
| `fundsArray[].funds` | **コインの枚数** | 金額 = 総和 **× 100**。円として扱うと 1/100 になる（本家 `MachineAndFundsList.jsx`） |
| `collect_funds.date` | **JST 深夜 0 時の epoch（ミリ秒）** | `src/shared/date.ts` の `getEpochTimeInSeconds(y, m, d)` で組み立てる |

`getEpochTimeInSeconds` は**名前に反してミリ秒を返す**（`Date.UTC(y, m-1, d) - 32_400_000`）。Web の `src/functions/makeDate/date.js` からのコピーなので、直すときは両方同時に直す。

⚠️ **期間の下限を `Date.now() - N日` で作らない。** `date` は JST 深夜 0 時なので、
UTC の「今この瞬間」から引くと境界が JST の 1 日の途中（前日 15:00Z）に落ち、
**境目の日が丸ごと欠ける**。JST の年月日を出してから `getEpochTimeInSeconds` で組むこと
（`getRecentCollectFunds` がこれで「過去1ヶ月」から 1 日落としていた）。

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

## 行数の上限（PostgREST）

⚠️ **`.limit()` も `.range()` も付けない select は 1000 行で打ち切られる。**
`supabase/config.toml` の `max_rows = 1000` がそれで、**エラーも警告も出ない**。
「合計が実際より少ない」「履歴が途中で終わっている」という形でしか気づけない。

5 店舗 × 月 8 回なら**年 480 件**なので、必ず届く数字。実際に総額収益
（`getStoreRevenueSummary`）と売上履歴（`getOrgCollectFundsInPeriod`）が
この上限に向かっていた。

- Web 側の**全件取得は `src/functions/fetchAllRows.js` を通す。** 1000 件ずつページングする
- ⚠️ **並び順に一意な列が要る。** `date` や `totalFunds` は同点があるので、それだけで
  並べるとページの境目で行が重複したり飛んだりする（`fetchAllRows` が最後に `id` を足している）
- ⚠️ **`PAGE_SIZE` は `max_rows` 以下でなければならない。** 超えると 1 ページが満たされず、
  「短いページ＝終端」と誤判定して**途中で打ち切る**。`max_rows` を下げるときは両方直す
- 月単位のもの（`getMonthFunds` / `getMonthFundsByOffset` / `getAllMonthBenefits`）は
  1 か月に 1000 件を超えないので素のままにしてある

## プロフィール

- ⚠️ **表示名（`username`）と氏名（`full_name`）は両方必須。** Web の `updateProfile` が
  `if (!fullname || !username) return { error: "空のフォームデータがあります" }` で弾くので、
  片方だけ送ると 400 になる。空文字も同じ扱いなので、どちらかを消すことはできない
- `PATCH /api/v1/profile` は**1 回に 1 種類だけ**反映する（`collectMethod` →
  `avatarExt` → `username`/`fullname` の順に早期 return）。まとめて送っても先に
  当たったものしか効かない

### アカウントのアイコン

店舗画像と同じ 2 段構え（署名付き URL → 端末から直接 `PUT`）だが、3 点違う。

1. `POST /api/v1/profile/avatar/signed-url` に送るのは `contentType` **だけ**。
   ⚠️ **ファイル名を送らない。** 保存先は `avatars/{user.id}.{ext}` とサーバが決める。
   名前を渡せるようにすると他人のアイコンを差し替えられる
2. ⚠️ **`x-upsert: true`。** パスが固定なので 2 回目以降は必ず上書きになる
   （店舗画像は時刻 + uuid で衝突しないので `false`。ここだけ逆）
3. アップロードのあと `PATCH /api/v1/profile` に `{ avatarExt }` を送って確定する。
   ⚠️ **URL は送らない。** サーバが `user.id` から組み直す。URL を受け付けると、
   他メンバーの画面に描かれる画像の src を自由に差し替えられる

- ⚠️ **保存する URL には `?v=<時刻>` が付く。** パスが固定なので、付けないと URL が
  1 文字も変わらず、端末とブラウザのキャッシュが古い画像を出し続ける
  （変えたのに変わらないように見える）。DB に入れる値ごとキャッシュバスタを含める
- ⚠️ **Web の `/api/upload/avatar`（multipart）をアプリから使わない。** 実体が Vercel の
  関数を通るので 4.5MB 上限に当たる（店舗画像と同じ罠）

## 開発者からのお知らせ

`announcements` テーブル（005）。組織に関係なく全ユーザー共通。

- **投稿は Supabase の Table Editor から手で行う。** 管理画面も書き込み API も無い
  （作ると、アプリのトークンでお知らせを捏造できる経路が生まれる）
- ⚠️ **`published` の既定は false。** 書き終えてから true にする
- ⚠️ **RLS に書き込みポリシーを足さない。** 読めるのは「公開中かつ期限内」だけで、
  書けるのは service role のみ。Table Editor は service role なので素通りする
- ⚠️ 絞り込みは **RLS と Server Action の両方**に持たせてある。Server Action は
  サービスクライアントで引く（RLS を素通りする）ので、あちらの `WHERE` が
  実際の防波堤。外すと下書きがそのままアプリに出る
- ⚠️ `published_at` は **BFF が epoch（ミリ秒）に畳んでから返す。** ISO 文字列のまま
  渡すと端末で `new Date(<文字列>)` を通すことになり、Hermes のパースに寄りかかる
  （日付が全画面 NaN になった事故と同じ入口）
- 未読は**端末ローカル（MMKV）に「最後に見た公開日時」1 つ**だけ持つ。
  ⚠️ 機種変更・アプリの入れ直しでリセットされ、2 台使うと片方だけ既読になる。
  正確に持つなら `announcement_reads` テーブルが要る

### ⚠️ 本文に書いてはいけないこと（Guideline 3.1.3(a)）

**アプリを更新せずに文面を出せる**作りなので、審査を通ったあとに違反文面を出せてしまう。
Apple はこれを嫌う。以下は投稿するすべてのお知らせに当てはまる。

- 価格・プラン名と金額（「Pro プランは◯◯円」）
- 外部サイトでの購入・契約への**言及**（「Web サイトから契約できます」）
- `collecie.com` へのリンク、Stripe を想起させる表記

⚠️ **空のまま審査に出さない。** 審査員が開いても何も出ず、機能が動いていないのか
中身が無いのか区別が付かない。005 が最初の 1 件を入れている。

## 集金スケジュール

- 「設定しない」は `PUT /api/v1/org/collect-schedule` に **`{ schedule: null }`** を送る。
  ⚠️ `{ type, days: [] }` ではない。BFF が「集金日を 1 つ以上選んでください」で 400 を返す
- ⚠️ 未設定にすると**集金前日・当日のリマインダー通知も止まる**（Edge Function が
  `collect_schedule` を見て対象組織を選ぶ）。画面でそう説明してある

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
- `GET /home` の `recentFunds` は**過去 1 か月を全件**返す（上限 200 件）。件数はアプリが決める。⚠️ **BFF 側で切らないこと。** カードの見出しが「過去1ヶ月の集金記録」なので、5 件に切ると集金の多い組織では半月ぶんしか届かず見出しと中身が食い違う（実際にそう見えていた）
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
