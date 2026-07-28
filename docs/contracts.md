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

実体の出し入れは `POST` / `DELETE /api/v1/stores/images`（`withAuth` で Web と共通の Server Action `uploadStoreImage` / `deleteStoreImage` を呼ぶだけ）。

- ⚠️ **Storage と DB は別操作。** この API は実体を置く／消すだけで `laundry_store.images` は触らない。DB 側は店舗の `PATCH` に配列ごと送って反映する
- ⚠️ **削除は保存が通ってから。** 先に実体を消すと、保存をやめたときに写真だけ失う
- ⚠️ **保存に失敗したらアップロード済みを消して巻き戻す**（本家 `useStoreSubmit.js` と同じ）
- 受け付けるのは jpeg / png、10MB まで。ファイル名は `${Date.now()}_${uuid}.${ext}`
- アプリからは `FormData` に `{ uri, name, type }` を append すれば送れる（base64 変換は不要）。`apiFetch` が multipart を検知して `Content-Type` を外す

## 集計の定義

- ホームの「1 回あたり平均」= **月の集金金額 ÷ 集金回数**。`storeCount`（その月に回った店舗数）で割らない。本家 `SalesCardClient.jsx` の `FundsDisplay` と同じ式
- `MonthlyPoint.storeCount` は「何店舗を回ったか」用。`plan.storeCount`（組織の現在の店舗数）とは別物で、過去の月では一致しない

## エンドポイントの癖

- `GET /funds/chart` の `to` は**排他**（`lt`）。その月を含めたいなら翌月 1 日を渡す
- `GET /funds/summary/monthly` は前年同月比のため**過去 2 年固定**。任意期間は `/funds/chart?groupBy=month`（`byStore` 付き）を使う
- `useFundList` は `order` / `asc` を渡せない。並び替えはクライアント側でやっている

## 既知の未対応

- 非 admin が他人の集金データを編集すると、403 ではなく**0 行更新の 200** が返る。UI 側で `myRole` を見て出し分けている
- Supabase の Apple プロバイダが未有効。有効化するまで実機の Apple サインインは失敗する
