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

⚠️ **このテーブルは Web とアプリで共用している。出し分けの列は無い**（2026-07-30 の決定）。
つまり **Web 向けに書いたつもりのお知らせも、そのままアプリに出る。** Web は Apple の
審査を受けないので本来は価格の話を書けるが、**書いた瞬間にアプリ側が 3.1.3(a) に触れる。**
「Web だけに出す」手段は無いので、**Web に出すものも含めて常に iOS の制約で書くこと。**
必要になったら `show_in_app`（既定 false）列の追加を再検討する。

⚠️ **アプリに無い画面へ誘導しない。** 最初の 1 件に「ご意見は設定画面からお送りいただけます」
と書いていたが、フィードバックの画面は **Web にしかなくアプリには無い**。
Web の画面をそのまま前提にしないこと。

⚠️ **上の注意は Supabase の Table Editor にも出してある**（テーブルと列の COMMENT）。
お知らせを書くときに人が見るのはドキュメントではなくあちらなので、
**文面ルールを変えたら 005 の COMMENT も直すこと。**

⚠️ **空のまま審査に出さない。** 審査員が開いても何も出ず、機能が動いていないのか
中身が無いのか区別が付かない。005 が最初の 1 件を入れている。

## アクションログ（`action_message`）

「誰がいつ何をしたか」の履歴。`GET /api/v1/org/messages` で組織のメンバー全員ぶんが出る。

| 列 | 中身 |
|---|---|
| `message` | 表示する文面（プレーンテキスト） |
| `date` | **epoch ミリ秒**。⚠️ `created_at` 列もあるが**使っていない**（並び順も表示も `date`） |
| `user` | 操作した人。`profiles` を join して表示名を出す |
| `org_id` | 組織。未所属で作られた行は NULL |

- ⚠️ **文面は必ずサーバで組み立てる。** アプリから文字列を受け取って記録する API を
  作らないこと。作った瞬間「〇〇さんが全店舗を削除しました」のような**偽の履歴を
  作れる経路**になる。BFF は Server Action の**戻り値**（実際に保存された行）から
  店舗名を取っている。body の値は使わない

### 何を記録するか

**基準は「組織のデータ・設定を変える操作」**（2026-07-31 の決定）。
おおむね「アプリで toast（または同等の完了表示）が出る操作」と一致する。
記録は必ず BFF 側で行う。⚠️ **アプリから記録用の API を叩く作りにしない。**

⚠️ **書き込み口はアプリ（BFF）だけではない。Web の `showToast()` も書く**
（`src/functions/makeToast/toast.js` → `createMessage`）。**同じテーブルを共用しており、
アプリの画面には両方が出る。** アプリ側だけ直しても Web 経由の分は残るので、
記録する / しないを変えるときは**必ず両方**を見ること。実際、BFF から
プロフィールの記録を外したあとも「プロフィールを更新しました」が出続けていた
（Web の `useUserProfile.js` が書いていた）。

⚠️ **`showToast` は既定で「error 以外」を記録する。** 2026-07-31 まで失敗トーストも
無条件に書いており、**起きていない操作が履歴に並んでいた**（41 件）。
個人に閉じた操作は `{ log: false }`、ログにだけ別の文面を使いたいときは
`{ logMessage: "…" }` を渡す。

⚠️ **個人に閉じた設定は記録しない。** ログは組織の全員が読むので、本人しか
関係しないものを出す理由が無い。具体的には**通知設定とプロフィール**
（氏名・表示名・アイコン・集金方法）。toast は出るが記録しない、という
唯一の例外なので、`PATCH /profile` と `PATCH /notifications/prefs` に
理由をコメントで残してある。**「toast があるのに漏れている」と見えて
足し直されるのを防ぐため。**

| 記録している | ルート |
|---|---|
| 集金データの登録・編集・削除 | `POST /funds` / `PATCH DELETE /funds/[id]` |
| 店舗の登録・編集・削除 | `POST /stores` / `PATCH DELETE /stores/[id]` |
| 在庫・設備の更新 | `PATCH /states/[laundryId]/stock` `/machines` |
| 集金スケジュールの更新・未設定化 | `PUT /org/collect-schedule` |
| プランの変更 | `POST /billing/apple/verify` |
| 組織名・参加パスワード | `PATCH /org` / `PUT /org/join-password` |
| 招待の作成・取り消し | `POST /org/invitations` / `DELETE /org/invitations/[id]` |
| メンバーの権限変更・削除 | `PATCH DELETE /org/members/[userId]` |
| 組織への参加 | `POST /org/join` |

**記録していないものと、その理由:**

- `POST /devices`（プッシュトークンの登録）… ⚠️ **起動のたびに呼ばれる。**
  記録すると起動回数だけログが増える。「通知を有効にしました」の toast は出るが、
  端末側の OS 許可が主で、この口は 1 対 1 に対応しない
- `POST /profile/avatar/signed-url` / `stores/images*` … 署名付き URL の発行と
  Storage への出し入れ。**DB に反映されるのは別のルート**（`PATCH /profile` /
  `PATCH /stores/[id]`）で、そちらで記録済み。ここも記録すると二重になるうえ、
  アップロードしただけで保存しなかった分まで残る
- `PATCH /notifications/prefs` / `PATCH /profile` … **個人に閉じた設定**。
  ⚠️ 通知設定はトグル 1 つごとに 1 行増えるので、記録すると履歴が埋まる
- `POST /funds/export`（CSV / Excel の書き出し）… **読み取りだけで組織のデータを
  変えない。** 条件を変えて何度も押す操作なので、残すと履歴が書き出しで埋まる
- `DELETE /account`（アカウント削除）… 消えた本人の行になるため表示名が引けず
  「他のユーザー」になる。所有者の削除では組織のログごと消える
- 集金画面の「入力内容を一時保存しました」… 端末内（MMKV）の下書きでサーバに届かない

⚠️ **文面に秘密と個人情報を書かない。** ログは組織の全員が読む。残さないもの:

- 参加パスワード
- 招待の token（**リンクそのもの**。残すと誰でもそのリンクで参加できる）
- **メールアドレス**（招待の宛先、組織参加時の管理者の宛先）。
  ⚠️ 招待の宛先は一度残していたが外した。**保留中の招待一覧は admin にしか
  出していないのに、ログは全員が読む**ため、そこだけ可視範囲が広がっていた

⚠️ 一方で「招待は作れたがメールだけ送れなかった」の別は**残す**。
届いていないことに気づけないと、相手を待たせたままになる。
- ⚠️ **`logAction` は失敗しても本体の操作を壊さない。** ログが残らないことより
  集金の登録が失敗するほうが困るため、例外を握りつぶす設計にしてある
- ⚠️ **編集・削除は「0 行更新の 200」がある。** 非 admin が他人の集金データを
  操作したときで、`error` だけ見ると**実際には起きていない操作がログに残る。**
  `updateData` / `deleteData` が返す `changed`（件数）を見ること
- ⚠️ **再送ではログを残さない。** Outbox は応答を受け取れないと必ず再送するので、
  `duplicated` のときに書くと同じ集金が何度も履歴に並ぶ
- ⚠️ **必ず範囲を切って取る。** ログは操作のたびに増えるので、`.limit()` を
  付けないと PostgREST の 1000 行上限に当たって古い順から黙って欠ける
  （「行数の上限」を参照）。BFF は `offset` / `limit` を受け、
  1 件多く引いて `hasMore` を返す
- ⚠️ **`isMe` はサーバが判定して返す。** 端末に生の uuid を配らないため

### RLS（006）

⚠️ **PostgreSQL の RLS ポリシーは OR で結合される。** 2026-07-31 まで
`authenticated` に対して SELECT / INSERT / UPDATE / DELETE がすべて `true` で
開いており、別に用意されていた組織スコープの SELECT ポリシーは**一度も
効いていなかった**（緩いほうが常に勝つ）。その状態では

- 他組織のログが全部読める
- `user` を他人の uuid にして **INSERT できる＝履歴を捏造できる**
- 既存の行を書き換え・削除できる

006 で緩い 4 本を落とし、SELECT は「自分の組織か自分の行」、INSERT は
`"user" = auth.uid()` かつ自分の組織のみに絞った。UPDATE / DELETE の
ポリシーは**作っていない**（監査ログなので後から変えられてはいけない）。
⚠️ 組織・アカウント削除時のログ削除は **service role 経由なので RLS を通らず、
影響を受けない**（`account/action.js` と `organization/action.js`）。

## 法務文書（利用規約・プライバシーポリシー）

⚠️ **本文が Web とアプリの 2 か所にある。**（2026-07-30 の決定）

| | 場所 |
|---|---|
| 正本（Web） | `../coin-laundry-app/src/app/app/terms/page.jsx` / `src/app/privacy/page.jsx` |
| 複製（アプリ） | `src/content/legal/terms.ts` / `privacy.ts` |

**片方だけ直すと、アプリだけが古い規約を出し続ける。必ず両方を同時に直すこと。**

もとは WebView で Web を開いていた（`app/settings/webview.tsx`。削除済み）。
静的なテキストなのに毎回 0.3〜1.0 秒かかっていたのを解消するために取り込んだ。
⚠️ 遅さの原因は Web の `src/middleware.js` のマッチャが `/app/*` も拾っていて、
**開くたびに Supabase のセッション更新が走り `Cache-Control: no-store` になる**こと。
Web 側でこれを除外すれば WebView に戻す選択肢も復活する。

- ⚠️ **文面を「アプリ向けに」書き換えない。** 条文の取捨選択は Web の `/app/terms`
  （アプリ専用版）で済んでいる。二重に判断を入れない
- ⚠️ **外部での契約に触れる条文を足さない**（Guideline 3.1.3(a)）。
  「Web サイトで契約できます」等の**申込み手段としての**言及・`collecie.com` への購入リンクが対象
- ⚠️ **一方、アプリ内課金そのものの条件は書く。** 利用規約の第5条（料金・支払い）・
  第6条（解約・返金）が App Store 経由の購読を前提に入っている。
  **2026-07-31 以前はこの 2 条を落としてあったが、それはアプリが何も売らなかった頃の話。**
  IAP を入れた以上、規約が購読に沈黙していると「売らないと書いてあるのに売っている」状態になる
- ⚠️ **規約に価格を数字で書かない。** 出してよいのは StoreKit の `displayPrice` だけ
  （`src/billing/products.ts` と同じ理由。Guideline 3.1.2）。
  Web 版 `/terms` の ¥780 / ¥2,980 を持ち込まない
- ⚠️ **返金を「当方が行う」と書かない。** IAP の返金は Apple の手続きで、開発者は実行できない。
  Web 版 `/terms` 第6条の「7日以内にメールで申し出れば返金」は Stripe 向けの条文
- ⚠️ **特商法（`/tokushoho`）はアプリに載せない。** Web の当該ページは Stripe 決済
  （当方が販売者）を前提に販売価格と決済条件を書いているので、そのまま載せると
  外部での購入条件の提示になる。
  ⚠️ **「アプリ内課金が無いから掲示義務が無い」という理由は 2026-07-29 に失効している**
  （IAP を入れたため）。現在の理由は「App Store 経由の購読では Apple が販売者に
  なる」こと。**これは法務の判断なので審査提出前に確認すること**
- ⚠️ **メール・電話をリンクにしない。** `mailto:` / `tel:` でアプリの外へ出す導線になる
- 複製が正本と一致しているかは機械で確かめられる（空白を落として部分文字列で照合する。
  ⚠️ 利用規約の見出しは正本では `number` と `title` に分かれているので、
  「第1条 サービスの概要」という 1 つの文字列としては存在しない）

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
- ⚠️ **`GET /funds/chart` の `count` は「組織全体の集金回数」。`byStore` で分かれない。**
  1 か月の応答は `{ month, total, count, storeCount, byStore: { [id]: 金額 } }` で、
  **店舗ごとに分かれているのは金額だけ**。`byStore` から金額を取り出して店舗別の
  グラフを描くことはできるが、**その隣に出す「◯回」は全店舗の回数**になる。
  - **1 店舗を見る画面では `?storeId=` を付ける**（`getStoreFundsForChart` に切り替わり、
    `count` がその店舗のものになる）。⚠️ 実際に店舗別ページの「◯回」がずれていた
  - ⚠️ **「1 回あたり」= `total / count` は特に効く。** 回数が全店舗ぶんになると
    **実際より小さい数字**が出る。型エラーにならず、桁も自然なので気づけない
- `GET /funds/summary/monthly` は前年同月比のため**過去 2 年固定**。任意期間は `/funds/chart?groupBy=month`（`byStore` 付き）を使う
- ⚠️ **`GET /funds` の `offset` + `limit` は「直近 2 か月」しか返さない。** `getOrgCollectFundsPaginated` が `startEpoch = changeEpocFromNowYearMonth(-2)` を固定しているため、`offset` をいくら進めてもそれより古いデータには**絶対に届かない**。全件を見せる画面では使わないこと（`useFundList` がこれ）
- 売上履歴は `GET /funds?from=0&order=&asc=`（`to` は省略＝全期間）を使う。`getOrgCollectFundsInPeriod` は期間の下限が無く、**`ORDER BY` もサーバで効く**。`useFundHistory` がこれ
- `GET /home` の `recentFunds` は**過去 1 か月を全件**返す（上限 200 件）。件数はアプリが決める。⚠️ **BFF 側で切らないこと。** カードの見出しが「過去1ヶ月の集金記録」なので、5 件に切ると集金の多い組織では半月ぶんしか届かず見出しと中身が食い違う（実際にそう見えていた）
- ⚠️ **並び替えの対象を期間で絞らない。** 期間を区切って取ると「売上が高い順」の先頭がその期間の中の最高額になり、全期間の最高額ではなくなる。一度に出す件数を絞るのは**受け取ったあと**（`historyRows.ts` の `limit`）で、取得範囲とは別の話

## データの書き出し（CSV / Excel）

`POST /api/v1/funds/export`。Web の `/api/export/collect-csv` `/api/export/collect-xlsx` の
アプリ版で、**Cookie ではなく Bearer で叩ける**ようにしたもの。

```
{ format: "csv" | "xlsx", startEpoch, endEpoch, storeIds?, splitMethod? }
  → { data: { format, name, base64, recordCount } }
```

- ⚠️ **`endEpoch` は「含む」（`lte`）。** `GET /funds/chart` の `to` は排他なので**向きが逆**。
  「その月まで」を出したいときは翌月 1 日ではなく **その 1 ミリ秒前**を渡す
  （翌月 1 日をそのまま渡すと、翌月 1 日の集金が 1 件だけ混ざる）
- ⚠️ **返るファイルは必ず 1 つ。** iOS の出口は共有シートしか無く、複数ファイルだと
  数だけシートが開く。したがって **CSV は分割しない**（`splitMethod` を無視する）。
  分割が効くのは Excel のシートだけ。Web の CSV は月ごと・店舗ごとに分けて
  連続ダウンロードするので、**同じ条件でも Web とアプリでファイル数が違う**
- ⚠️ **整形ロジックをアプリに持たせない。** Web の `src/functions/csvExport.js` /
  `xlsxExport.js` をこのルートがそのまま呼ぶ。2 リポジトリに同じ整形を置くと、
  片方だけ直したときに**型エラーも出ないまま列がずれる**（商品 ID と同じ罠）
- ⚠️ **中身は base64。** `Buffer.from(csv, "utf8")` で畳むこと。既定（latin1 相当）だと
  BOM と日本語が壊れ、端末で開いたときに全部化ける
- ⚠️ **Vercel の 4.5MB を base64 の長さで先に弾いている**（`MAX_BASE64_LENGTH`）。
  弾かないと途中で切れた JSON が端末に届き、パースエラー＝「通信できませんでした」に
  しか見えない（原因がデータ量だと分からない）。全件取得なので件数は伸びる
- ⚠️ **Pro 以上（サーバ判定）。** アプリ側の `plan` はボタンの出し分けだけ。
  ここを開けるとアプリだけ無料で書き出せてしまう
- アクションログには**残さない**（組織のデータを変えないため。理由は下の一覧）

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

## 支払方法とキャッシュレス（007）

集金 1 件の中で、現金とキャッシュレスを**方法ごとに分けて**持つ。

```
collect_funds.totalFunds = 現金ぶん + sum(cashless[].amount)   ← DB に入るのは総額
collect_funds.cashless   = [{ methodId, name, amount }]        ← amount は「円」
```

- ⚠️ **API が受け取る `totalFunds` は「現金ぶん」で、DB に入るのは総額。**
  組み立てるのは `createData` / `updateData` **だけ**。画面の合計を送ると二重計上になる
- ⚠️ **`updateData` で `cashless` を省略＝「据え置き」。** Web の編集画面は
  キャッシュレスを知らずに現金ぶんだけ送ってくるので、既存の合計を足し戻さないと
  **キャッシュレスの金額が総額から静かに消える。** BFF 側でも `?? []` にしないこと
  （空配列は「消す」の意味）
- ⚠️ **現金は `payment_methods` に行として持たない。** 常に存在する暗黙の方法で、
  金額は引き算で出す。行にすると「現金を無効化できる」「二重に数える」の両方が起きる。
  「現金」という名前の作成もサーバが弾く
- ⚠️ **`cashless` に `name` を焼き込む**（`fundsArray` と同じ）。方法を使わなくしても
  過去の集金が名前を失わない。**逆に、名前を変えても過去の表示は変わらない**（意図的）
- ⚠️ **クライアントが送る `name` は使わない。** サーバが `methodId` から引き直す。
  他組織の `methodId` と、同じ方法の重複も弾いている
- ⚠️ **「削除」は物理削除にしない**（過去の `cashless` が参照している）。`is_active = false`
- ⚠️ **`byStore` と `byMethod` は独立した畳み方。**「この店舗の PayPay」は
  **データとして存在しない。** 支払方法で絞るときは店舗の選択を解除すること
  （残すと絞っているつもりの店舗が黙って無視される）。集金回数も方法ごとには分かれない
- ⚠️ 書き出しは **設備の列 + 現金（内訳なし）+ 支払方法の列 = 合計** が常に成り立つ。
  出さないと横に足しても合計に合わない表になる

## 経費（008）

単発（在庫の仕入れ・修理代）と、毎月の固定費（家賃・水道光熱費）の 2 本立て。

| | |
|---|---|
| `expenses.amount` | **円**。⚠️ `fundsArray[].funds` は硬貨の枚数なので単位が違う |
| `expenses.date` | **JST 深夜 0 時の epoch（ミリ秒）**。`collect_funds.date` と同じ規約 |
| `expenses.laundry_id` | **NULL = 組織全体**（店舗に紐づかない支出）。必須にしない |

- ⚠️ **`GET /expenses` の `to` は「含む」（`lte`）。** `/funds/chart` の `to` は排他なので
  **向きが逆**（書き出しと同じ）。月末は翌月 1 日ではなく**その 1 ミリ秒前**を渡す
- ⚠️ **期間は必須。** 経費は増え続けるので、切らないと 1000 行の上限で古い順から黙って欠ける
- ⚠️ **カテゴリの文字列は 2 リポジトリに同じものを持っている**（Web の
  `EXPENSE_CATEGORIES` とアプリの `src/components/expenses/categories.ts`）。
  片方だけ直すと「カテゴリが不正です」で登録できなくなる

### 毎月の固定費は「読むときに展開する」

`recurring_expenses` は**定義だけ**を持ち、実体の行は作らない。

- ⚠️ **pg_cron で生成しない。** 004 の経路は失敗が 2 つのテーブルに分かれて記録される
  ほど追いにくく、経費が黙って欠ける／二重に入る事故のほうが高くつく
- ⚠️ **金額を変えると過去の月まで遡って変わる。削除すると過去の月からも消える。**
  「今月から上がった」は `end_month` を入れて終わらせ、新しい定義を作る
- ⚠️ **展開した項目は編集・削除できない。** `id` が `recurring:<定義id>:<YYYY-MM>` で
  実在しないため。アプリは `recurring: true` を見て導線を出さず、サーバも 400 で弾く
- ⚠️ **`day_of_month` は 1〜28。** 29〜31 は存在しない月があり、その月だけ計上が飛ぶ
  （DB の CHECK とサーバ側の両方で弾いている）
- ⚠️ **当月は支払日の到来前でも計上する**（発生主義）

## プランの制限（店舗数・メンバー数）

上限は Web の `src/functions/plans.js` にある。**アプリ側の値は表示専用**
（`src/billing/products.ts` の `PLAN_STORE_LIMIT`）。判定の正は Server Action。

| | free | pro | max |
|---|---|---|---|
| 店舗数（`PLAN_LIMITS`） | 3 | 5 | 無制限 |
| メンバー数（`PLAN_MEMBER_LIMITS`） | **1** | 無制限 | 無制限 |

- ⚠️ **`PLAN_LIMITS` と `PLAN_MEMBER_LIMITS` を取り違えない。** 名前が似ていて
  どちらも同じ plan キーで引くので、間違えても例外にならず「店舗が 1 件しか作れない」
  「メンバーが 3 人まで入れる」という形で静かに壊れる
- ⚠️ **メンバーが増える経路は 3 つある。1 つでも塞ぎ忘れると制限が意味を持たない。**
  2026-08-01 まで 3 つとも `plan` を見ておらず、**free でもメンバーを無制限に増やせた**

  | 経路 | Server Action |
  |---|---|
  | 招待を作る | `inviteMember` |
  | 招待を受ける（行が増えるのはここ） | `acceptInvitation` |
  | 参加パスワードで直接入る | `requestJoinOrg` |

  ⚠️ **招待だけ塞いでも参加パスワードが開いている。** 参加パスワードは admin が
  一度配れば誰でも使えるので、そちらが本命の抜け道になる
- ⚠️ **招待の受諾でも必ず確認する。** Pro のときに作った招待が残ったまま free へ
  下がることがあるので、「作れた ＝ 受けられる」ではない
- ⚠️ **判定するのは「増やすとき」だけ。** プランを下げても既存メンバーは外さない。
  外すと支払いを止めた瞬間に集金担当者がアプリを開けなくなって現場が止まる。
  **上限を超えたまま留まるのを許容する**
- ⚠️ **保留中の招待は数えていない。** free の上限が 1 人（オーナーが居る時点で常に満杯）で
  招待自体を作れず溜まらないため。**Pro に有限の上限を入れるなら招待の件数も足すこと**
- ⚠️ **エラー文言に外部サイトでの契約を匂わせない**（Guideline 3.1.3(a)）。
  「プランを変更してください」までに留め、どこで変更するかは書かない

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
