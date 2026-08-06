# Collecie iOS（Expo アプリ）

コインランドリー集金アプリ「Collecie」の iOS ネイティブアプリ版。**このリポジトリには Expo アプリのみを置く。**

## 毎回読むもの

型エラーにならず静かに壊れる箇所をまとめてある。実装前に必ず目を通すこと。

@docs/contracts.md
@docs/traps.md

⚠️ **この 2 つは毎回読み込まれる。** したがって**この CLAUDE.md に規約を書き写さない。**
「どこに書いてあるか」だけ置き、中身はあちらに 1 か所だけ持つ。

## 設計図の場所

**設計図の正本はこのリポジトリにない。** Web/BFF 側リポジトリの `docs/ios/` にある。

```
../coin-laundry-app/docs/ios/README.md      ← 目次。まずここを読む
```

| よく参照する章 | パス |
|---|---|
| 認可の置き場所（BFF 採用の根拠） | `docs/ios/02-authz-decision.md` |
| API 仕様（`/api/v1/*`） | `docs/ios/06-api-bff.md` |
| 画面設計 | `docs/ios/07-screens.md` |
| オフライン設計（Outbox） | `docs/ios/09-offline.md` |
| デザイントークン | `docs/ios/11-design-system.md` |
| App Store 審査要件 | `docs/ios/13-app-review.md` |
| **提出用の掲載情報（正本）** | `docs/ios/app-store/metadata_ja.md` |

設計に関わる決定を行ったら、**このファイルではなく `docs/ios/README.md` の決定事項ログに追記すること。**

## リポジトリ体制

2026-07-27 の決定により、モノレポ化はしない。

| リポジトリ | 役割 |
|---|---|
| `coin-laundry-app` | Next.js の Web UI + モバイル向け BFF（`/api/v1/*`）+ 設計図 |
| `coinlaundy_app_iOS`（ここ） | Expo / React Native アプリ |

⚠️ **同じ機能が両方にあるものが多い**（集金入力・編集・収益・経費・支払方法）。
**片方だけ直すと型エラーも出ないまま静かにずれる。** 変更する前に、
`docs/contracts.md` でその機能に「2 リポジトリに同じものがある」旨の警告が
出ていないか必ず確かめること。

## 絶対に守ること

- **`SUPABASE_SERVICE_KEY` をこのリポジトリに持ち込まない。** アプリが持つのは `NEXT_PUBLIC_SUPABASE_ANON_KEY` 相当のみ。DB への書き込みは必ず BFF 経由。
- **認可判定をアプリ側で信じない。** ロールは UI の出し分けにだけ使う。正は Server Action。
- **日付は必ず JST 基準で組み立てる。** `src/shared/date.ts` を通す。詳細は `docs/contracts.md`。
- **集金登録は必ず Outbox 経由で送る。** 直接 POST しない。`Idempotency-Key`（uuid v4）を画面を開いた時点で発行し、下書きと一緒に保持する。
- **課金はアプリ内課金（StoreKit）だけ。**
  出してよいのは `app/settings/plan.tsx` の購入導線と **StoreKit が返した `displayPrice`** のみ。
  価格を文字列でハードコードしない（地域・為替・価格改定でずれ、Guideline 3.1.2 に触れる）。
  **外部購入への言及の禁止も有効。** 「Web サイトで契約できます」等の**言及**、`collecie.com` への
  購入リンク、Stripe を想起させる表記はいずれもリジェクト事由。
- **購入はサーバで検証してから確定させる。** `purchaseToken`（JWS）を `POST /billing/apple/verify` に
  送り、**200 が返ってから** `finishTransaction()` を呼ぶ。順序を逆にすると検証に失敗した購入が宙に浮く。
- **本番への SQL 適用・EAS のビルド・ASC の操作はユーザーが行う。** こちらは SQL と
  確認クエリ、コマンドまでを用意する。

## API の呼び出し方

```
ベース URL: https://www.collecie.com/api/v1
認証:       Authorization: Bearer <supabase access_token>
成功:       { "data": ... }
失敗:       { "error": { "message": "日本語メッセージ", "code": "FORBIDDEN" } }
```

`401 UNAUTHENTICATED` を受けたらセッション更新を 1 回だけ試行し、失敗したらログイン画面へ。
エラーコードごとの挙動は `docs/ios/06-api-bff.md` の 6.6 を参照。

⚠️ **新しいルートを足したら、アプリから叩く前に本番へ出す。** 未デプロイのとき
**404 ではなく 405 や「200 + HTML」が返る**ので、画面には「エラーが発生しました」しか
出ず原因に辿り着けない。確認コマンドは `docs/traps.md` の「BFF のルートを足したとき」。

## コードの書き方

### コンポーネントは画面ごとにまとめる

`src/components/` の直下にファイルを置かない。**必ずどれかのディレクトリに入れる。**
ディレクトリ名はルート名に合わせてあるので、どの画面のものか名前だけで分かる。

| ディレクトリ | 対応する画面 |
|---|---|
| `common/` | どこからでも使う汎用部品（`ui` `form` `dialog` `toast` `SegmentedTabs` `CalendarPicker`） |
| `auth/` | `app/login.tsx` `signup.tsx` |
| `home/` | `app/(tabs)/index.tsx` |
| `stores/` | `app/(tabs)/stores/` |
| `revenue/` | `app/(tabs)/revenue.tsx` |
| `manage/` | `app/(tabs)/manage/` |
| `expenses/` | `app/(tabs)/expenses/` |
| `collect/` | `app/collect/[storeId].tsx` |

画面が増えたら同じ規則でディレクトリを足す。

- **「組み立て（純関数）」と「見た目」を分ける。** `historyRows.ts` が売上履歴の行を組み、
  `FundHistoryRows.tsx` がそれを描く。条件分岐を追うときは前者だけ読めば足りる。
  ⚠️ **大文字小文字だけで名前を分けない**（Windows の tsc が同一視して TS1149）
- **2 つ以上の画面から使うものでも、持ち主がはっきりしているならその画面のディレクトリに置く。**
  `manage/StateEditSheet` はホームと店舗詳細からも開くが、中身は在庫・設備なので `manage/`。
  画面をまたいで意味が変わらないものだけ `common/`
- **import は `@/components/<画面>/<名前>` の絶対パスで書く。** `./` の相対 import を使わない
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

### 見た目の決めごと

- ⚠️ **アプリに濃色の面は 1 つも無い。**
  `AuthBackground` / `onDark.*` / `Button variant="light"` は消してある。**戻さない**
  （⚠️ 2026-08-06 に `app/welcome.tsx` を作り直したが、**あちらも純白**。
  経緯は `docs/traps.md` の「未ログインの起点」）
- ⚠️ **未ログインの起点・初期設定・ログイン・新規登録は純白の紙**
  （`app/welcome.tsx` / `app/setup.tsx` / `auth/AuthScreen.tsx`）。
  **カードに戻さない。teal / cyan を面で使わない。** 使ってよいのは主ボタン
  （`variant="gradient"`）とリンク・フォーカス枠などの**線と点だけ**
  - ⚠️ **入力欄は `tone="plain"`。** 既定は白い下地 + `divider` の枠で、
    **白の上では枠も下地も見えず入力欄だと分からない**（1.2:1）
  - ⚠️ **フォーカス枠も plain 専用のものを使う。** 既定の `cyan400` は白に対して 1.8:1 で、
    **平常時の枠より薄いのでフォーカスすると枠が消えたように見える**
- ⚠️ **`color.divider`（#F1F5F9）を白地の区切り線に使わない**（1.07:1 で見えない）。
  白地に直接引く線は `color.border`（#E2E8F0）
- ⚠️ `app/join-organization.tsx` は**ログイン後**の画面なので `GradientHeaderCard`
  のまま。ここを揃えに行かないこと

### コメント

処理の説明を書き写したコメントは不要。**書くのは「知らないと踏む罠」だけ**（単位、上書きされるフィールド、Web で動かない API など）。`⚠️` を付けておく。

---

# 現在地（2026-08-06）

**機能はすべて実装済みで、実機での確認は審査項目まで含めて通っている。
残るのは今日ぶんの修正を載せたビルドを作って提出することだけ。**

⚠️ **今 TestFlight にあるビルドには 2026-08-06 の修正が 1 つも入っていない**
（課金・未ログインの起点・取得失敗の画面・経費の円グラフ・組織への参加）。

タブは **ホーム / 店舗 / 収益 / 管理 / 経費**。⚠️ **設定の入口はホーム右上の歯車だけ**
（`GreetingHeader` の `onOpenSettings`）。**消すとサインアウト・組織への参加・プラン・
通知に二度と辿り着けない。** ⚠️ 組織未所属のときはタブがホーム 1 本になるので、
歯車を `hasOrg` で隠さないこと。

## 規約の在り処

**実装に入る前にここを引くこと。** 中身は `docs/contracts.md` にある。

| 機能 | 節 |
|---|---|
| 支払方法・キャッシュレス（007 / 009） | 「支払方法とキャッシュレス」 |
| 経費・固定費（008 / 012） | 「経費（008）」 |
| 月別利益 | 「月別利益」 |
| 担当店舗（011） | 「担当店舗（011）」 |
| 組織への参加・承認（013） | 「組織への参加（013）」 |
| プランの制限・商品 ID | 「プランの制限」「アプリ内課金（StoreKit）」 |
| 書き出し（CSV / Excel） | 「データの書き出し」 |
| 設備 id の安定化 | 「設備（`machines`）の id」 |
| アクションログ | 「アクションログ」 |
| お知らせ | 「開発者からのお知らせ」 |
| 法務文書（Web と 2 か所） | 「法務文書」 |

マイグレーションは **001〜013 まですべて適用済み**
（`../coin-laundry-app/docs/ios/migrations/`）。

⚠️ **新しい列を足すときは `organizations` に注意。** `getMyOrganization` の select に
混ぜると、未適用の環境で PostgREST が 42703 を返して**この Server Action ごと失敗し、
全員が閲覧者になる／組織未所属扱いになる**。別のクエリで取り、失敗しても既定値で
続行すること（`docs/traps.md` の「列を足したときに『権限が下がる』」）。

⚠️ **`npx supabase db query --linked -f <file>` で流せる**（SQL Editor に貼らなくてよい）。
⚠️ ただし先に `npx supabase link --project-ref …` が要る
（`.temp/linked-project.json` があっても CLI は「リンクされていない」と言う）。

## 実機で確認できていること

| | |
|---|---|
| 集金の登録・編集・書き出し | ✓ |
| 支払方法の登録と集金・収益の絞り込み | ✓ |
| 経費（月送り・円グラフ・固定費・権限の出し分け） | ✓ |
| 店舗画像のアップロード | ✓ |
| Apple サインイン（Guideline 4.8） | ✓ |
| **プッシュ通知（集金前日リマインダー）** | ✓ 開発ビルド + **TestFlight（本番 APNs）**の両方 |
| **アプリ内課金（Pro / Pro+ / Max の購入とアップグレード）** | ✓ TestFlight |
| **「購入を復元」**（Guideline 3.1.1） | ✓ TestFlight |
| **アカウント削除**（Guideline 5.1.1(v)） | ✓ |
| **組織への参加（申請 → 店舗管理者が承認、013）** | ✓ Web で往復を確認（2026-08-06） |
| **production ビルドの起動** | ✓ TestFlight |

⚠️ **Pro が「買えない」ときは ASC の契約状態を先に見ること**（2026-08-06 に丸一日溶かした）。
旧 Pro（`com.collecie.app.pro.monthly`）を**契約したままの端末**では、新 Pro
（`pronormal`）が**同じ購読グループの同順位**になるので、Apple が
「現在このサブスクリプションに登録しています」を出して**何も起きずに終わる**
（Pro+ / Max は上位なので通る＝**「Pro だけ失敗する」**という形で出る）。
⚠️ **TestFlight の購入は本物の Apple ID で行われる**ので、
ASC の「ユーザとアクセス → Sandbox → テストアカウント」には**現れず、
購入履歴を消せない**。サンドボックスは最大 6 回更新すると自動で失効する。

⚠️ **まだ見ていないもの**: 初期設定の「経費の記録」ステップ（**新しい組織を作らないと出ない**）/
**月別利益の赤字の月**（0 の線より下へ伸びる。経費が売上を超える月をわざと作る）。

### 通知を検証するとき

⚠️ **定時を待たない。`?force=1` で今すぐ送れる**（`collect-reminder`。集金予定日の判定を
飛ばす）。`&userId=<uuid>` で 1 人に絞れる。`x-cron-secret` が要る
（Vault の `collect_reminder_secret`）。

- ⚠️ **`{"sent":1,"disabled":0}` は「届いた」ではない。** `sendToExpo` は
  `DeviceNotRegistered` 以外のチケットエラーを `console.error` に出すだけで応答に含めない。
  APNs キーが無効でも `disabled:0` が返る。**端末で受信するまでが確認**
- ⚠️ **当日リマインダー（`daysUntil === 0`）は `alreadyCollected` で除外される。**
  同じ日に集金を登録していると飛ばないので、前日（`daysUntil === 1`）で試すほうが確実
- ⚠️ **開発ビルドと TestFlight で APNs の経路が違う**（sandbox / production）。
  片方で届いても他方の保証にはならない

## 審査提出までに残っていること

- [ ] ⚠️ **`f29e2cf` を載せた production ビルドを作り直して提出する。**
      決済シートが無応答のときにプラン画面のボタンが全部死ぬのを直したもの。
      ⚠️ **今 TestFlight にあるビルドには入っていない。**
      - ⚠️ **Pro の購入と復元は再確認しなくてよい**（商品 ID は変わっていない）
- [ ] Web の未 push コミット **`8c0784f`**（`?force=1`）を push する。
      ⚠️ Edge Function は既にデプロイ済みなので**動作には影響しないが、
      リポジトリと本番が食い違ったままになる**

済んだもの: 掲載情報の文面 / スクリーンショット 5 枚 / サポート URL（`/help` の
プラン名を修正済み）/ デモデータ（3 店舗版のシードを作成・投入）/ アプリアイコン /
お知らせの文言レビュー / **Pro の購入**（2026-08-06）/ **「購入を復元」**（同、
Guideline 3.1.1）/ **アカウント削除の動線**（同、Guideline 5.1.1(v)）/
**ASC の 3 商品**（日本価格と、表示名を Pro / Pro+ / Max に修正）/
**特商法**（載せる側に倒してアプリ専用版を `src/content/legal/tokushoho.ts` に用意。
⚠️ **「載せない判断の確認」は失効した項目**）/ お知らせ SQL の投入。

## 提出後に回すもの

- [ ] ⚠️ **アプリを `main` にマージする。** 開発は `feat/iap-and-push`。
      **`main` には 124 コミット入っていない**
- [ ] **無料トライアル（Pro の導入オファー）。** ⚠️ **提出前は付けられない**
      （サブスクが審査を通ってから欄が現れる）。⚠️ **アプリの再ビルドは不要**
- [ ] **App Store Server Notification が届いているかを見る**（Vercel のログの
      `[apple/notifications]`）。⚠️ **更新・解約・返金を反映する経路はこれだけ**なので、
      黙って落ちていると**解約したのに Pro のまま**になる。
      ⚠️ ログはキー名しか出さない（取引情報と識別子は出さない）ので貼っても安全
- [ ] 低在庫・機器故障アラートの確認。⚠️ **2 つ目のアカウントが要る**
      （`pushToOrg` に `exceptUserId` を渡しているので自分の操作では自分に届かない）
- [ ] **未実装**: 「未送信データ督促」のローカル通知（設計図 10.2 の 5 番目）。
      `scheduleNotificationAsync` を呼ぶ箇所が無い
- [ ] **保留**: アプリに Google ログインを足すか（2026-07-30 に保留）。
      ⚠️ **Web で Google / GitHub で登録した人はアプリにログインできない**（パスワードが無い）。
      要るのは `expo-web-browser`（→ EAS 再ビルド 1 回）と Supabase の Redirect URLs に
      `collecie://` を足すことだけ（Google Cloud は触らずに済む）。
      判断材料は Authentication → Users に `google` の行が実際にあるか

## 既知の不具合

- ⚠️ **端末トークンが再登録されないことがある**（`src/push/pushToken.ts`）。
  MMKV の `SYNCED_KEY` が一致すると POST を飛ばすので、**サーバ側の
  `device_tokens` の行が消えるとアプリは二度と登録し直さず、通知が永久に止まる。**
  `expo_token` は UNIQUE で、同じ端末を別ユーザーが使うと行が付け替わるため実際に起こり得る。
  直すならキャッシュのキーにユーザー ID を含めるか、一定期間で送り直す
- 非 admin が他人の集金データを編集すると、403 ではなく**0 行更新の 200** が返る
  （UI 側で `myRole` を見て出し分けている）
- 集金リマインダーの Edge Function は**担当店舗（011）に未対応**（別デプロイのため）
- 機器ごとのキャッシュレスの内訳は、集金の詳細画面から編集できない
  （直すには登録し直してもらう）
