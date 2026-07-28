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
- **課金導線を一切置かない。** アップグレードボタン・価格表・外部リンクに加え、「Web サイトで契約できます」等の**言及**も App Store のリジェクト事由になる。プランは read-only 表示のみ。

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

### なるべくコンポーネントで分ける

- **ルートファイル（`app/**`）には画面の組み立てだけを書く。** データ取得と遷移はルート側、見た目とローカルな状態を持つ塊は `src/components/` に切り出す
- **1 ファイル 300 行を超えたら分割する。** 機能を足すときも、既存の巨大ファイルにさらに積まない。現時点で超えているもの:
  `StateEditSheet.tsx` 731 / `settings/organization.tsx` 629 / `setup.tsx` 562 / `revenue.tsx` 555 / `MonthlyRevenueCard.tsx` 479 / `StoreForm.tsx` 435
- **画面固有のコンポーネントは `src/components/<画面名>/` に置く**（`src/components/home/` に倣う）。2 画面以上で使うものだけ `src/components/` 直下
- **同じ見た目が 2 か所に出たらコピーせず共通化する。** シート・カード・フィルタは特に重複しやすい
- **新規に作る前に既存を探す。** 過去に `MonthSalesPager` と `MonthlySalesCarousel` を二重に作って片方を捨てている

### 共通部品を使う

- 確認ダイアログ → `useDialog()`（`Alert.alert` は Web で動かない）
- 成否の通知 → `useToast()`。**ミューテーションには成功・失敗どちらのトーストも必ず付ける**
- 入力欄 → `src/components/form.tsx` の `Input` / `Field` / `RadioCardGroup` / `Checkbox`
- 色・余白 → `src/theme/tokens.ts`。生の色コードを直接書かない

### コメント

処理の説明を書き写したコメントは不要。**書くのは「知らないと踏む罠」だけ**（単位、上書きされるフィールド、Web で動かない API など）。`⚠️` を付けておく。

## 現在の状況

Expo アプリは実装済み（タブ 4 本 + 集金モーダル + 設定）。ブラウザ実機確認の段階。
BFF は `/api/v1` 配下に一通り揃っている（`src/app/api/v1/**` を参照）。

残っている大きめの課題:

- Supabase の Apple プロバイダが未有効（実機の Apple サインインが失敗する）
- マイグレーション 002 が未適用
- App Store 審査用の `/terms/app` ページが未作成
- `/api/invite` が認証なしの Resend リレーになっている
