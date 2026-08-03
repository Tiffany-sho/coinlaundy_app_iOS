# Collecie iOS（Expo アプリ）

コインランドリー集金アプリ「Collecie」の iOS ネイティブアプリ版。**このリポジトリには Expo アプリのみを置く。**

## 毎回読むもの

型エラーにならず静かに壊れる箇所をまとめてある。実装前に必ず目を通すこと。

@docs/contracts.md
@docs/traps.md

## 設計図の場所

**設計図の正本はこのリポジトリにない。** Web/BFF 側リポジトリの `docs/ios/` にある。

```
../coin-laundry-app/docs/ios/README.md      ← 目次。まずここを読む
```

| よく参照する章 | パス |
|---|---|
| 認可の置き場所（BFF 採用の根拠） | `../coin-laundry-app/docs/ios/02-authz-decision.md` |
| API 仕様（`/api/v1/*`） | `../coin-laundry-app/docs/ios/06-api-bff.md` |
| 画面設計 | `../coin-laundry-app/docs/ios/07-screens.md` |
| オフライン設計（Outbox） | `../coin-laundry-app/docs/ios/09-offline.md` |
| デザイントークン | `../coin-laundry-app/docs/ios/11-design-system.md` |
| App Store 審査要件 | `../coin-laundry-app/docs/ios/13-app-review.md` |

設計に関わる決定を行ったら、**このファイルではなく `docs/ios/README.md` の決定事項ログに追記すること。**

## リポジトリ体制

2026-07-27 の決定により、モノレポ化はしない。

| リポジトリ | 役割 |
|---|---|
| `coin-laundry-app` | Next.js の Web UI + モバイル向け BFF（`/api/v1/*`）+ 設計図 |
| `coinlaundy_app_iOS`（ここ） | Expo / React Native アプリ |

## 絶対に守ること

- **`SUPABASE_SERVICE_KEY` をこのリポジトリに持ち込まない。** アプリが持つのは `NEXT_PUBLIC_SUPABASE_ANON_KEY` 相当のみ。DB への書き込みは必ず BFF 経由。
- **認可判定をアプリ側で信じない。** ロールは UI の出し分けにだけ使う。正は Server Action。
- **日付は必ず JST 基準で組み立てる。** `src/shared/date.ts` を通す。詳細は `docs/contracts.md`。
- **集金登録は必ず Outbox 経由で送る。** 直接 POST しない。`Idempotency-Key`（uuid v4）を画面を開いた時点で発行し、下書きと一緒に保持する。
- **課金はアプリ内課金（StoreKit）だけ。** 2026-07-29 に「read-only 表示のみ」から方針転換した。
  出してよいのは `app/settings/plan.tsx` の購入導線と **StoreKit が返した `displayPrice`** のみ。
  価格を文字列でハードコードしない（地域・為替・価格改定でずれ、Guideline 3.1.2 に触れる）。
  **外部購入への言及の禁止は今も有効。** 「Web サイトで契約できます」等の**言及**、`collecie.com` への
  購入リンク、Stripe を想起させる表記はいずれもリジェクト事由。
- **購入はサーバで検証してから確定させる。** `purchaseToken`（JWS）を `POST /billing/apple/verify` に
  送り、**200 が返ってから** `finishTransaction()` を呼ぶ。順序を逆にすると検証に失敗した購入が宙に浮く。

## API の呼び出し方

```
ベース URL: https://www.collecie.com/api/v1
認証:       Authorization: Bearer <supabase access_token>
成功:       { "data": ... }
失敗:       { "error": { "message": "日本語メッセージ", "code": "FORBIDDEN" } }
```

`401 UNAUTHENTICATED` を受けたらセッション更新を 1 回だけ試行し、失敗したらログイン画面へ。
エラーコードごとの挙動は `docs/ios/06-api-bff.md` の 6.6 を参照。

## コードの書き方

### コンポーネントは画面ごとにまとめる

`src/components/` の直下にファイルを置かない。**必ずどれかのディレクトリに入れる。**
ディレクトリ名はルート名に合わせてあるので、どの画面のものか名前だけで分かる。

| ディレクトリ | 対応する画面 | 中身の例 |
|---|---|---|
| `common/` | どこからでも使う汎用部品 | `ui` `form` `dialog` `toast` `SegmentedTabs` `CalendarPicker` |
| `auth/` | `app/login.tsx` `signup.tsx` | `AuthScreen` `AuthMessage` `PasswordField` |
| `home/` | `app/(tabs)/index.tsx` | `MonthlySalesCarousel` `QuickActions` `useCardSwipe` |
| `stores/` | `app/(tabs)/stores/` | `StoreForm` `StoreImagePicker` `MachineListSheet` |
| `revenue/` | `app/(tabs)/revenue.tsx` | `charts` `MonthlyRevenueCard` `MonthRangePicker` |
| `manage/` | `app/(tabs)/manage/` | `StateEditSheet` `StockControls` `laundryState` |

`revenue/` は「組み立て（純関数）」と「見た目」を分けてある。`historyRows.ts` が売上履歴の行を組み、`FundHistoryRows.tsx` がそれを描く。条件分岐を追うときは前者だけ読めば足りる。

画面が増えたら同じ規則でディレクトリを足す（`collect/` `settings/` など）。

- **2 つ以上の画面から使うものでも、持ち主がはっきりしているならその画面のディレクトリに置く。**
  `manage/StateEditSheet` はホームと店舗詳細からも開くが、中身は在庫・設備なので `manage/`。
  画面をまたいで意味が変わらないものだけ `common/`
- **import は `@/components/<画面>/<名前>` の絶対パスで書く。** `./` の相対 import を使わない
  （置き場所を動かすたびに書き換えが発生するため）
- **ルートファイル（`app/**`）には画面の組み立てだけを書く。** データ取得と遷移はルート側、
  見た目とローカルな状態を持つ塊はコンポーネントへ
- **1 ファイル 300 行を超えたら分割する。** 機能を足すときも、既存の巨大ファイルにさらに積まない
- **同じ見た目が 2 か所に出たらコピーせず共通化する。** シート・カード・フィルタは特に重複しやすい
- **新規に作る前に既存を探す。** 過去に `MonthSalesPager` と `MonthlySalesCarousel` を二重に作って片方を捨てている

### 共通部品を使う

- 確認ダイアログ → `useDialog()`（`Alert.alert` は Web で動かない）
- 成否の通知 → `useToast()`。**ミューテーションには成功・失敗どちらのトーストも必ず付ける**
- 入力欄 → `@/components/common/form` の `Input` / `Field` / `RadioCardGroup` / `Checkbox`
- 色・余白 → `src/theme/tokens.ts`。生の色コードを直接書かない
- 金額・数値 → `numeric` を**丸ごと展開**する（`style={{ ...numeric, fontSize: 20 }}`）。
  `fontFamily: font.num` だけ書くと `fontVariant` が落ち、Inter は等幅ではないので
  金額を縦に並べたとき桁が揃わなくなる

### コメント

処理の説明を書き写したコメントは不要。**書くのは「知らないと踏む罠」だけ**（単位、上書きされるフィールド、Web で動かない API など）。`⚠️` を付けておく。

## 現在の状況

Expo アプリは実装済み（タブ 4 本 + 集金モーダル + 設定）。ブラウザ実機確認の段階。
BFF は `/api/v1` 配下に一通り揃っている（`src/app/api/v1/**` を参照）。

アプリ内課金（StoreKit）とプッシュ通知はコードを実装済み。**ただしどちらも動作確認は
まだ 1 度もできていない。** Expo Go では両方とも動かないので EAS の development build が
要る（`eas.json` は用意済み）。

### 済んでいること（2026-07-30 時点）

- マイグレーション **002 / 003 / 005 は適用済み**（005 は `announcements`。
  1 行・RLS 有効・ポリシーは SELECT の 1 本だけ、を SQL で確認済み）
  - ⚠️ **`npx supabase db query --linked -f <file>` で流せる。** SQL Editor に
    貼らなくてよい。⚠️ ただし先に `npx supabase link --project-ref …` が要る
    （`.temp/linked-project.json` があっても CLI は「リンクされていない」と言う）
- **お知らせは実データで動く状態**。投稿は Supabase の Table Editor から手で行う
  （管理画面も書き込み API も無い）。⚠️ 下書き・期限切れが漏れないことは
  述語を SQL で突き合わせて確認済み（draft / expired = 不可視、live / 期限が未来 = 可視）
- Edge Function `collect-reminder` は**デプロイ済み**（`--use-api --no-verify-jwt`）。
  `CRON_SECRET` も設定済み。`?dryRun=1` で送信直前まで全経路が通ることを確認した
  （`targetOrgs:2 / recipients:3 / tokens:0`）
- **Web は本番に反映済み**（`coin-laundry-app` の `main` に merge 済み）。
  本番で確認した挙動:
  - `/api/v1/devices` `/api/v1/notifications/prefs` `/api/v1/billing/apple/verify` … 未認証で 401
  - `POST /api/apple/notifications` … 偽の JWS を 400 で拒否（Apple が叩く経路なので 401 にはしない）
  - `/app/terms` `/app/privacy` … 200。**描画後の HTML に他ページへのリンクが 1 本も無い**
    （ナビ・フッター・戻るリンクが全て消えている。Guideline 3.1.3(a)）
  - `/terms` `/tokushoho`（公開側）は従来どおりナビと戻るリンクが出る
- **2026-07-30 の追加ぶんも本番に反映済み**（`fix/home-recent-funds-window` を merge）。
  未認証で 401 を確認したもの: `GET /api/v1/announcements` /
  `POST /api/v1/profile/avatar/signed-url` / `PATCH /api/v1/profile` /
  `GET /api/v1/funds/summary/stores`
  - ホームの「過去1ヶ月の集金記録」の窓を JST 基準に直し、件数の頭打ちも外した
  - **PostgREST の 1000 行上限**で集計が黙って欠けるのを直した（`fetchAllRows`）。
    ⚠️ 詳細と守るべき条件は `docs/contracts.md` の「行数の上限」
  - `/funds/summary/stores` が `count` / `firstDate` / `lastDate` も返すようになった
- **004（pg_cron）は適用済み**。`pg_cron 1.6.4` / `pg_net 0.19.5`、
  `collect-reminder-hourly` が `0 * * * *` / `active=true`、Vault は 2 件とも `rows=1`。
  cron の本文を手で撃って **200 + `{"sent":0,"reason":"no_target_org","orgsWithSchedule":2,
  "schedules":[{"daysUntil":3,"type":"monthly"},{"daysUntil":6,"type":"monthly"}],"jstHour":10}`**
  を確認した（UTC 01:51 → JST 10:51 なので時差の計算も正しい）
- **cron の自動起動も確認済み**。02:00 UTC に `cron`（`succeeded`）→ 0.1 秒後に
  `http`（200、`jstHour: 11`）が並ぶことを確認した
  - ⚠️ 最初は URL が `https://<PROJECT_REF>.supabase.co/…` のままで、
    `net._encode_url_with_params_array` が `<` `>` を扱えず**キューに積む前に**
    毎時例外を投げていた（`cron.job_run_details` に `failed` +
    `Quote command returned error`。`net._http_response` には行が増えない）。
    **失敗は 2 つのテーブルに分かれて記録される。**読み方は `docs/traps.md` の
    「pg_cron → pg_net → Edge Function」に書いた
- **プッシュ通知が実機に届いた（集金前日リマインダー）。** これで
  `sendToExpo` まで含めて全経路が通った。EAS の development build を実機に入れ、
  プライミング → OS 許可 → `device_tokens` に登録 → 空撃ちで `wouldSend: 1` →
  本送信で `{"sent":1,"disabled":0}` → 端末で受信、まで確認
  - ⚠️ **`disabled: 0` は「エラーが無かった」ではない。** `sendToExpo` は
    `DeviceNotRegistered` 以外のチケットエラーを `console.error` に出すだけで
    応答に含めない。APNs キーが無効（`InvalidCredentials`）でも
    `{"sent":1,"disabled":0}` が返る。配信を疑うときは Edge Function のログを見る
  - ⚠️ 当日リマインダー（`daysUntil === 0`）の検証には注意。同じ日に集金を
    登録していると `alreadyCollected` で除外されるため、前日（`daysUntil === 1`）で
    試すほうが確実
- **Apple サインインが実機で通った**（Guideline 4.8）。Supabase の Apple プロバイダの
  Client IDs に `com.collecie.app` を入れるだけ。⚠️ Services ID も `.p8` も要らない
  （理由は `docs/contracts.md`）
- **店舗画像のアップロードが実機で成功**（署名付き URL で Storage へ直接送る経路）
- **利用規約・プライバシーポリシーをアプリ内のテキストにした**（2026-07-30）。
  WebView（`app/settings/webview.tsx`）は削除。⚠️ **法務文書の正本が Web、複製がアプリ、の
  2 か所になった。片方だけ直すとアプリが古い規約を出し続ける**（`docs/contracts.md` の
  「法務文書」）。Web 側の 2 ファイルにも相互参照のコメントを入れてある
  - 遅かった原因は Web の `src/middleware.js` のマッチャが `/app/*` も拾っていること。
    静的なテキストなのに**開くたびに Supabase のセッション更新が走り
    `Cache-Control: no-store` になる**（`X-Vercel-Cache: MISS` / TTFB 0.3〜1.0 秒）。
    そこへ 95KB の HTML と JS 20 本が続く
- **実機で 8 件の不具合を見つけて直した。** どれもブラウザでは再現しないもの:
  日付が全部 NaN（Hermes の `new Date`）/ 通知プライミングが出ない（`fullScreenModal` は
  下の画面を unmount しない）/ キーボード上の余白（`keyboardVerticalOffset` の二重計上、
  3 画面）/ キャンセル・戻るが無反応（ルートの `Modal` がモーダル画面の下）/
  モーダル画面でトーストが見えない / 画像アップロードが失敗（Vercel の 4.5MB 上限）/
  店舗別収益の履歴が 2 か月しか出ない（`useFundList` の罠）/ ステータスバーが白のまま残る。
  **原因と直し方はすべて `docs/traps.md` に節を立てて書いた**
- **未ログイン画面（`app/welcome.tsx`）を廃止し、ログイン画面を起点にした**（2026-08-01）。
  「App Store で選んで入れた時点で説明は済んでいる」ため。紹介 3 枚のコラージュが
  **差し替え前提のモック画像のまま**で、出すなら実画面のスクショを作る作業が先に
  発生することも決め手になった。詳細と復活方法は `docs/traps.md` の該当節。
  - ⚠️ **`/welcome` はサインアウト後の着地点でもあった**（5 か所）。全部 `/login` に向けた
  - ⚠️ **ログイン画面に「戻る」は無い**（起点なので戻り先が無い）
  - ⚠️ **審査でデモアカウントの重みが増した。** 起動して最初に出るのが素のログイン壁
- **ログイン・新規登録をカード無し・白基調にした**（2026-07-31）。それまでは薄い水色の地に
  `GradientHeaderCard` を 1 枚置く形。今は**純白の紙にフォームを直接置く**
  （`src/components/auth/AuthScreen.tsx`）。
  - ⚠️ **カードに戻さない。teal / cyan を面で使わない。** 使ってよいのは主ボタン
    （`variant="gradient"`）とリンク・フォーカス枠などの**線と点だけ**
  - ⚠️ **入力欄は `tone="plain"` を指定する。** 既定は白い下地 + `divider`（#F1F5F9）の枠で、
    **白の上では枠も下地も見えず入力欄だと分からない**（枠は 1.2:1）。
    plain は薄い灰色を敷き、枠を `textFaint` まで濃くする
  - ⚠️ **フォーカス枠も plain 専用のものを使う。** 既定の `cyan400` は白に対して 1.8:1 で、
    **平常時の枠より薄いのでフォーカスすると枠が消えたように見える**
  - ⚠️ **`color.divider`（#F1F5F9）を白地の区切り線に使わない**（1.07:1 で見えない）。
    白地に直接引く線は `color.border`（#E2E8F0、2026-07-31 に追加）
  - ⚠️ **アプリに濃色の面はもう 1 つも無い**（2026-08-01 に未ログイン画面を廃止したため）。
    `AuthBackground` / `onDark.*` / `Button variant="light"` も一緒に消してある
  - ⚠️ `app/join-organization.tsx` は**ログイン後**の画面なので `GradientHeaderCard`
    のまま。ここを揃えに行かないこと
- **2026-07-31 のぶんも実機で確認済み**（3 件とも通した）
  - **月別売上の店舗別内訳を折りたたみ式にした**（棒を押す / 見出しの開閉ボタンで開く）
  - **店舗一覧を都道府県で絞り込めるようにした。** 店名にフリガナが無く
    「店舗名順」が読み順にならないため。判定は `src/components/stores/prefecture.ts`。
    ⚠️ **「東京都府中市」は「京都府」を部分文字列として含む**ので、
    先頭一致 → 最も手前、の順で見ている（詳細はソースのコメント）
  - **集金データの CSV / Excel 書き出しを実装（実機で保存まで確認済み）。**
    Web も本番に反映済み（`POST /api/v1/funds/export`）。
    ⚠️ **EAS 再ビルドは不要だった。** `expo-file-system` は `expo` 本体が既に
    依存しており、共有は RN 標準の `Share` で足りる（`expo-sharing` を入れていない）
- **機器別内訳・支払方法・経費の 3 機能を入れた**（2026-08-02〜08-03）。
  **v1.0 に含めてから審査に出す**という判断。**実機で確認済み**
  （支払方法の登録・集金・収益の絞り込みまで通した）。
  - **機器別の売上内訳**（`GET /funds/summary/machines`）… スキーマ変更なし。
    `collect_funds.fundsArray` が機器の id と名前を持っているので集計するだけ
  - **支払方法**（007 → 009 で**組織ごとから店舗ごとへ移した**）… 現金は行として
    持たず引き算で出す。⚠️ 規約は `docs/contracts.md` の「支払方法とキャッシュレス」に
    まとめてある。**単位と据え置きの規約が独特なので実装前に必ず読む**
  - **経費**（008）… 単発 + 毎月の固定費。固定費は**読むときに展開する**（行を作らない）
  - あわせて**機器ごとのキャッシュレス**、**書き出しの列が支払方法ごとに割れる**、
    **設備 id の振り直しを止めた**（`stableMachineIds`）
  - ⚠️ **Web 側も同じ機能を持たせてある。** 集金入力・編集ドロワー・収益の
    「支払方法別」タブ。**片方だけ直すと静かにずれる**箇所が多い
- **支払方法の追加をお知らせで配信した**（2026-08-03）。文面は
  `../coin-laundry-app/docs/ios/announcements/2026-08-03_payment_methods.sql`。
  ⚠️ **Web とアプリの両方に出ている**（出し分けの列は無い）
- **Pro+ プラン（10 店舗 / ¥1,500）を足した**（2026-08-03）。キーは `proplus` で、
  **Apple の商品 ID の中身と同じ綴り**（`com.collecie.app.proplus.monthly`）。
  ⚠️ 010 の CHECK が DB 側の防波堤。**価格は Web が ¥800 / ¥1,500 / ¥3,000、
  アプリは StoreKit の `displayPrice`**（アプリに価格の文字列は 1 つも無い）
  - ⚠️ 有料機能の出し分けは **`planAtLeast(plan, "pro")`** を通す。
    プラン名を並べると足すたびに直し漏れる（実際に書き出しが Pro+ を弾いていた）
- **無料トライアル（Pro のみ）を出せるようにした**（2026-08-03）。
  ⚠️ **アプリでは実装できない。** App Store Connect の**導入オファー**で、
  アプリは StoreKit が返した内容を出すだけ（`src/billing/introOffer.ts`）。
  ⚠️ **提出前は付けられない**（サブスクが審査を通ってから欄が現れる）。
  付けるのは審査通過後で、**アプリの再ビルドは不要**
- **担当店舗を入れた**（011、2026-08-03）。集金担当者・閲覧者ごとに管理者が
  店舗を割り当て、**担当でない店舗の集金・在庫には一切かかわれない。**
  ⚠️ 規約と落とし穴は `docs/contracts.md` の「担当店舗」。
  **強制は `getStores()` の 1 か所**で、Web とアプリの両方に同時に効く
  - ⚠️ **集金リマインダーの Edge Function は未対応**（別デプロイ）
- **経費をタブへ昇格させ、設定と入れ替えた**（2026-08-03）。タブは
  **ホーム / 店舗 / 収益 / 管理 / 経費**。⚠️ **設定の入口はホームのヘッダ右上の歯車
  だけ**（`GreetingHeader` の `onOpenSettings`）。**消すとサインアウト・組織への参加・
  プラン・通知に二度と辿り着けない。** ⚠️ 組織未所属のときはタブがホーム 1 本に
  なるので、歯車を `hasOrg` で隠さないこと。
  ⚠️ `/settings` の URL は変えていない（`app/settings/index.tsx` へ移しただけ）
  - ⚠️ **経費タブは `expensesEnabled` が false の組織では出ない**（画面は残る）
- **書き出しに経費と月別利益を足せるようにした**（2026-08-03、`includeExpenses`）。
  ⚠️ **既定は false。** CSV は 1 ファイルに表が 3 つ縦に並ぶ形になり、
  **会計ソフトへそのまま取り込めなくなる**ため。規約は `docs/contracts.md` の
  「経費と月別利益を足す」
- **経費も担当店舗で絞り、権限を分けた**（2026-08-03）。担当外の店舗の経費は
  一覧に出ない（**組織全体のぶんは残す**）。⚠️ 強制は `expenses/action.js` の中
  （`getStores()` ではない）。規約は `docs/contracts.md` の「担当店舗と権限」
  - 集金担当者は**単発の登録**と、**自分が登録した当月の分の編集**ができる。
    **削除と固定費の管理は admin だけ**
  - ⚠️ **編集の可否は行ごとに変わる。** サーバが判定して応答の **`editable`** に
    畳んで返すので、**画面で「自分か」「当月か」を組み立て直さないこと**
    （正は Web の `src/functions/expenseScope.js`）。
    ⚠️ 古い応答では `undefined` なので **`editable ?? 管理者か`** に倒す
  - ⚠️ **出し分けをひとまとめの `canEdit` にしない。** 登録・編集・削除で
    条件が違うので、混ぜると押しても 403 になるボタンが出る
- **店舗別の収益ページから「1回あたり」を外した**（2026-08-03）。
  ⚠️ **ホームの「1回あたり平均」は別物で今も出ている**（`MonthlySalesCarousel`）
- **月次サマリーを「月別利益」に差し替えた**（2026-08-03、012）。全体版・店舗別版とも。
  前月比・前年同月比の表より、**売上 − 経費**のほうが日々の判断に効くため。
  タブは 全体が 店舗別 / 月別 / 月別利益、店舗別が 月別 / 機器別 / 月別利益。
  ⚠️ **利益は負になり得る**ので棒は 0 の線をまたぐ。詳細は `docs/contracts.md` の
  「月別利益」。⚠️ **組み立ては 2 リポジトリに同じものがある**（片方だけ直さない）
- **経費を使うかを組織ごとに持たせた**（012）。初期設定で聞き、設定 → 組織で変更できる。
  ⚠️ **表示の設定であって認可ではない**（切っても行は消えず API も 403 にしない）。
  ⚠️ **既定は true**（false 既定だと入力済みの経費がアップデートで消える）。
  ⚠️ 判定は必ず `expensesEnabled()` を通す（規約は `docs/contracts.md`）
  - Web の初期設定は**組織の作成ステップの中**で聞く（ステップを増やすと
    進捗バーの分母が admin と非管理者で変わる）。**アプリは独立したステップ。
    構成が違うのは意図的**
- **経費を店舗ごと / 組織全体で絞り込めるようにした**（Web・アプリとも）。
  記録先の選択は元からあったが、一覧に**対象が出ておらず絞り込みも無かった。**
  ⚠️ `"all"`（絞らない）と `"org"`（`laundry_id` が NULL）を 1 つの値で兼ねないこと
- **経費画面を 1 枚にまとめた**（2026-08-03）。`expenses/recurring` の専用ページを
  畳み、追加は 1 つのボタンから **単発 / 固定費の 2 択**に分けた。
  あわせて**月ごとのカテゴリ別円グラフ**を足し、**月は横スライドで送る**ようにして、
  **固定費の「名前」の入力欄を外した**（カテゴリで足りる）。
  ⚠️ **送りは `ChartPager`**（月別売上と同じ）。`expenses/_layout.tsx` の
  `fullScreenGestureEnabled: false` を外すと**送りが全部「前の画面へ戻る」に化ける**
  ⚠️ **`recurring_expenses.name` は NOT NULL のまま**で、無ければサーバが
  カテゴリで埋める。**Web の入力欄は残してある**ので、送られた名前は尊重する
  - ⚠️ **円グラフに `react-native-svg` を使っていない**（入れると EAS の再ビルドが要る）。
    素の View で半円を回して描いている。規約は `docs/contracts.md`

### 残っているタスク

**A. 実機で動かす（development build は動いた。以降は画面の確認）**

- [x] `eas init` / `eas device:create` / `eas build --profile development --platform ios`
      → 実機にインストールして起動できた。手順と落とし穴は `docs/traps.md` の
      「EAS / 実機に入れるまで」
- [ ] EAS の環境変数に `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` を登録
      ⚠️ `development` では**不要**（JS をローカルの Metro から読むので `.env.local` が効く）。
      必須になるのは `preview` / `production` から
- [ ] 画面ひとつずつの実機確認（**まだ通しで見ていない**）。ブラウザで動いていて
      実機で崩れやすいのは、セーフエリアの余白、ホームの `PanResponder` のスワイプ、
      画像の選択とアップロード（HEIC）、キーボードが入力欄を隠す挙動
      - 個別に通したもの: 集金の登録・書き出し・店舗画像・Apple サインイン・
        **支払方法の登録と集金・収益の絞り込み**（2026-08-03）
      - 経費の画面は**確認済み**（2026-08-03。当時は `revenue/expenses/`）。
        月の横スライド・円グラフ・固定費・担当店舗での絞り込み・権限の
        出し分けまで通した
      - ⚠️ **まだ見ていないもの**（2026-08-03 時点）:
        初期設定の「経費の記録」ステップ（**新しい組織を作らないと出ない**）/
        **月別利益の赤字の月**（0 の線より下へ伸びる。経費が売上を超える月を
        わざと作って見る）

**B. プッシュ通知**

- [x] 集金前日リマインダーが実機に届いた（上の「済んでいること」を参照）
- [ ] 低在庫・機器故障アラートの確認
      ⚠️ **2 つ目のアカウントが要る。** `pushToOrg` に `exceptUserId: user.id` を
      渡しているので、自分の操作では自分に届かない。同じ組織に別ユーザーを招待し、
      片方で在庫を減らして他方で受け取る形になる
- [ ] **未実装**: 設計図 10.2 の 5 番目「未送信データ督促」（ローカル通知。
      「未送信の集金データが 2 件あります」）。`scheduleNotificationAsync` を呼ぶ箇所が無い。
      オフラインで登録したまま忘れるケースの保険なので、あると効く

**C. アプリ内課金**

⚠️ **有料アプリ契約を待たずに進められるものと、待つものを分けてある。** アプリレコードの
作成は契約とは別の話で、Developer Program が Active なら今できる。

契約を待たずにできる:

- [x] App Store Connect で**アプリレコードを作成済み**。
      **数値の Apple ID は `6796202962`**（公開値。App Store の URL に出るので秘密ではない）
- [x] Vercel に `APPLE_APP_APPLE_ID=6796202962` を設定済み
      ⚠️ **Production の検証にだけ要る。** Sandbox は未設定のまま通る
      （`utils/apple/verify.js` が `Environment.PRODUCTION` のときだけ例外を投げる）。
      `APPLE_BUNDLE_ID` は既定値 `com.collecie.app` が `app.json` と一致しているので不要。
      ⚠️ **追加しただけでは反映されない。** Vercel は既存のデプロイに環境変数を
      入れ直さないので、Redeploy か新しい push が要る
- [x] App Store Server Notifications の URL 登録済み（Production / Sandbox とも
      `https://www.collecie.com/api/apple/notifications`）。
      ⚠️ **Version の選択欄は無い。** Apple が V1 を廃止したので新しいアプリレコードは
      V2 固定。受け口も V2 の `signedPayload` 前提で書いてある
      - ⚠️ **まだ本物の通知は 1 通も受けていない。** 初回の Sandbox 購入で
        `SUBSCRIBED` が飛んだときに Vercel のログの `[apple/notifications]` で確認する。
        キー名しか出さないので貼っても安全（取引情報と識別子は出さない）

有料アプリ契約が Active になってから:

- [x] **有料アプリ契約が Active になった**（2026-08-03）
- [x] **サブスク商品を 3 つ作成**（`com.collecie.app.pro.monthly` /
      **`.proplus.monthly`** / `.max.monthly`、グループ `collecie_plan`）
      ⚠️ **商品 ID は一度作ると変更も再利用もできない。**
      ⚠️ **3 つある**（一時この一覧が「2 つ」のままで proplus が抜けていた）。
      2 つだけだと Pro+ は**購入が成立するのにプランが上がらない**
      （`PLAN_BY_PRODUCT_ID` の引きが外れて free 扱い）
- [x] **Sandbox で購入とアップグレードを確認**（2026-08-03）。
      商品取得 → 購入 → サーバ検証 → プラン反映まで通った
- [ ] ⚠️ **「購入を復元」だけ未確認。** 審査で**実際に試される**
      （Guideline 3.1.1 が復元手段を要求する）。端末を変えた／アプリを入れ直した
      ときに購読が戻るかを見る。
      ⚠️ **復元では `finishTransaction()` を呼ばない**（対象は既に完了済みの取引）
- [ ] ⚠️ **App Store Server Notification が届いたかを見る。** 初回の Sandbox 購入で
      `SUBSCRIBED` が飛んでいるはずなので、Vercel のログの `[apple/notifications]`
      を確認する（**それまで本物の通知は 1 通も受けていない**）。
      キー名しか出さないので貼っても安全

**D. 以前からの積み残し**

- [x] Supabase の Apple プロバイダを有効化（Guideline 4.8）。**実機で確認済み**。
      Client IDs に `com.collecie.app` を入れるだけで、Services ID や `.p8` は要らない
      （理由は `docs/contracts.md` の「既知の未対応」）
- [x] `/api/invite` を塞いだ。**認証 + その組織の admin であることを確認**し、
      宛先・組織名・ロール・招待者名・リンクは**すべて DB と環境変数から組み立てる**
      （body の値は一切使わない）。あわせて招待メールの HTML をエスケープした
      （組織名・招待者名は自由入力なので、生のまま差し込むとリンクを差し替えられる）。
      **本番で確認済み**: 未認証は 401（外部リンクを載せても認証の段階で止まる）、
      Web の招待フォームからは従来どおりメールが届く（クライアントは 1 行も変えていない）
- [ ] **保留**: アプリに Google ログインを足すか（2026-07-30 に保留と判断）
      - Web は Google / GitHub を出しているが、アプリはメール + パスワードと Apple のみ。
        ⚠️ **Web で Google / GitHub で登録した人はアプリにログインできない**
        （パスワードを持たないため）。回避策は Web の「パスワードをお忘れですか」で
        パスワードを設定してもらうことだが気づかれない
      - 費用はかからない（Google の OAuth は無料、同意画面の審査も基本スコープなら不要）
      - ⚠️ **Google Cloud を触らずに済む。** `signInWithOAuth`（ブラウザ経由）なら
        リダイレクト先が Supabase の `/auth/v1/callback` で、それは Web のために
        既に Google 側へ登録済み。要るのは `expo-web-browser` の追加（→ EAS 再ビルド 1 回）と
        Supabase の Redirect URLs に `collecie://` を足すことだけ
      - ⚠️ `WebView` では実装できない。Google が埋め込み WebView の OAuth を拒否するので
        `openAuthSessionAsync`（`ASWebAuthenticationSession`）を使う
      - 判断材料: Supabase の Authentication → Users に `google` の行が実際にあるか。
        ゼロなら急がない

**F. アクションログ**

- [x] アプリに画面を追加（`app/settings/action-log.tsx`。設定 → 組織 → アクションログ）
- [x] **BFF が操作を記録するようにした。** ⚠️ **それまで `/api/v1/*` は
      ログを 1 行も書いていなかった**ので、アプリでの操作は履歴に残っていなかった。
      記録するのは集金データの登録・編集・削除と店舗の登録・編集・削除の 6 つ
- [x] **マイグレーション 006 を適用済み**（`docs/ios/migrations/006_action_message_rls.sql`）。
      適用後に `pg_policies` を引いて **2 本だけ**（`action_message_insert_self` /
      `action_message_select_own_org`）になり、**UPDATE / DELETE の行が無い**ことを確認した
      - ⚠️ それまでは authenticated に対して SELECT / INSERT / UPDATE / DELETE が
        すべて `true` で開いており、**他人の名前でログを捏造できる**状態だった。
        厳しいポリシーも 1 本あったが、**RLS は OR で結合されるので効いていなかった**
        （対策済みに見えて無効、という形）。詳細は `docs/contracts.md` の「アクションログ」

**E. 審査提出前**

- [x] **説明文・App 名・サブタイトル・キーワード・プロモーションテキストを作成済み。**
      正本は `../coin-laundry-app/docs/ios/app-store/metadata_ja.md`
      （文字数は実測済み。App Store Connect に貼るだけ）。
      ⚠️ **金額は 1 か所も書いていない**（3.1.2）。⚠️ **外部購入に触れていない**
      （3.1.3(a)）。「ブラウザ版もあります」も書いていない。
      ⚠️ **有料機能は機能一覧から外して専用の節に寄せてある**
      （店舗数の上限・**メンバーの追加**・**データの書き出し**の 3 つ。
      無料は 3 店舗 / 1 人なので「チームで使う」は実質有料）
- [ ] **スクリーンショット 5 枚と App プレビュー**（構成が未定。
      経費・月別利益を入れるかで残り 4 枚の割り振りが変わる）
- [x] **文言レビュー済み**（2026-08-03）。手順と結果は
      `../coin-laundry-app/docs/ios/announcements/REVIEW.md`。
      公開中 2 件はどちらも**合格**（金額・プラン名・外部購入・Stripe いずれも無し）
      - ⚠️ **投稿のたびに通すこと。** アプリを更新せずに文面を出せるので、
        **審査を通ったあとも違反文面を出せてしまう**
      - ⚠️ 支払方法のお知らせに軽微なずれが 2 つある（リジェクト事由ではない）。
        「支払方法別のグラフ」は **Web ではタブだがアプリではタブではない**
      - 現在**2 件公開中**（005 の初回 + 2026-08-03 の支払方法）。どちらも
        価格・プラン名・外部購入への言及が無いことを確認済み
- [x] マイグレーション **005（お知らせ）を適用済み**。最初の 1 件も入っているので
      空のまま審査に出ることはない
- [ ] アカウント削除の動線確認（Guideline 5.1.1(v)）
- [ ] **審査用アカウントにデモデータを入れる。** SQL は用意済み:
      `../coin-laundry-app/docs/ios/seeds/demo_collect_funds.sql`
      （浅草・難波・博多・すすきの・祇園の 5 店舗 × 2025-01〜2026-07 の集金 285 件）

      ```
      npx supabase db query --linked -f docs/ios/seeds/demo_collect_funds.sql
      ```

      - ⚠️ **先に 5 店舗と設備を作っておく。** 店舗名で組織を特定し、無ければ中止する。
        設備が無い店舗は**合計入力モード**（`fundsArray` が空）で入り、機器別内訳に出ない
      - ⚠️ **支払方法（PayPay / 交通系IC / クレジットカード）はシードが作る。**
        通常の登録口は店舗フォームだけなので、これは**デモ専用の例外**
      - ⚠️ **経費は別のシート。** `docs/ios/seeds/demo_expenses.sql` を
        **集金のシードのあとに**流す（同じ 5 店舗を使う）。単発 133 件と
        毎月の固定費 13 件が入る。空のまま出すと、審査員には機能が
        動いていないのか中身が無いのか区別が付かない

        ```
        npx supabase db query --linked -f docs/ios/seeds/demo_expenses.sql
        ```

        取り消しは `DELETE FROM expenses WHERE note LIKE '%[seed-demo]%'` と
        `DELETE FROM recurring_expenses WHERE name LIKE '%[seed-demo]%'`
      - ⚠️ **実データのある組織で流さないこと。** 取り消しは
        `DELETE FROM collect_funds WHERE client_request_id LIKE 'seed-demo-%'`

**G. 提出のためのビルド（⚠️ ここまで development build しか作っていない）**

- [ ] EAS の環境変数に `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` を登録
      （A の項目と同じもの。⚠️ **`production` から必須**）
- [ ] **`eas build --profile production --platform ios` を通す**
      ⚠️ **development とは別物。** development は JS をローカルの Metro から読むが、
      **production はバイナリに埋め込む。** したがって
      **環境変数の解決・`.env.local` に頼っていた箇所・minify 後の挙動が
      ここで初めて効く。** 通らないと提出できない
- [ ] **TestFlight で実機に入れて一通り触る**（production ビルドで初めて出る不具合を拾う）
- [ ] ⚠️ **アプリを `main` にマージする。** 開発は `feat/iap-and-push` で進めており、
      **`main` には 100 コミット以上入っていない**（2026-08-03 時点）
