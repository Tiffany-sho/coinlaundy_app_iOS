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

- マイグレーション **002 / 003 は適用済み**（PostgREST で列の存在を確認）
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

### 残っているタスク

**A. 実機で動かす（ここが最大の関門。ほぼ全部がここ待ち）**

- [ ] `eas init` — `app.json` に `extra.eas.projectId` が入る。
      ⚠️ **これが無いと `getExpoPushTokenAsync` が落ちてトークンを取れない**
- [ ] `eas device:create` — 実機の UDID 登録。忘れるとインストールできない
- [ ] EAS の環境変数に `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` を登録
      （`.env.local` は EAS に渡らない）
- [ ] `eas build --profile development --platform ios` → 実機にインストール
- [ ] アプリ本体の実機確認（**一度も実機で動かしていない**）

**B. プッシュ通知（サーバー側は完成。端末待ち）**

- [ ] 実機で通知を許可 → `?dryRun=1` で `wouldSend` が 1 以上になることを確認
- [ ] dryRun を外して実際に届くことを確認
- [ ] **未検証の経路**: メッセージ組み立てと `sendToExpo`（トークン 0 件だと手前で return するため）

**C. アプリ内課金（App Store Connect 待ち）**

- [ ] **有料アプリ契約を Active にする**（審査中。数日〜1週間）
      ⚠️ Active でないと `fetchProducts` は空配列を返すだけでエラーも出ない
- [ ] サブスク商品 2 つを作成（`com.collecie.app.pro.monthly` / `.max.monthly`、グループ `collecie_plan`）
- [ ] App Store Server Notifications V2 の URL 登録
      （`https://www.collecie.com/api/apple/notifications`。**本番 URL を入れる。**
      プレビュー URL を登録するとそのデプロイが消えた時点で通知が届かなくなる）
- [ ] Vercel に `APPLE_APP_APPLE_ID` を設定（App Store Connect でアプリを作ると採番される数値 ID）
      ⚠️ **Production の検証にだけ要る。** Sandbox は未設定のまま通るので、採番されてから足せばよい。
      `APPLE_BUNDLE_ID` は既定値 `com.collecie.app` が `app.json` と一致しているので不要
- [ ] Sandbox テスターで購入・復元・アップグレードを確認
- [ ] **未検証の経路**: 購入フロー全体（商品取得すらできていない）

**D. 以前からの積み残し**

- [ ] Supabase の Apple プロバイダが未有効（実機の Apple サインインが失敗する。
      Guideline 4.8 で必須なので審査前に必ず）
- [ ] `/api/invite` が認証なしの Resend リレーになっている

**E. 審査提出前**

- [ ] スクリーンショット・App プレビュー・説明文
- [ ] 文言レビュー（外部購入への言及が無いこと。Guideline 3.1.3(a)）
- [ ] アカウント削除の動線確認（Guideline 5.1.1(v)）
