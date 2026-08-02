import { CASH_METHOD_KEY, methodKeyOf } from "@/api/types";
import type { CashlessEntry } from "@/offline/types";

/**
 * 支払方法での絞り込み。月別売上と売上履歴で同じ規約を使う。
 *
 * ⚠️ **キーは `"cash"` と `"method:" + 名前`。** サーバ（`/funds/chart` の
 *    `byMethod`）と同じ組み立てで、`methodKeyOf()` を通すこと。
 *    支払方法は店舗ごとなので、同じ「PayPay」でも店舗ごとに uuid が違う。
 *    **id で束ねると、組織全体で同じ名前のチップが店舗の数だけ並ぶ。**
 *
 * ⚠️ **空配列 = 絞り込まない。** `null` や番兵の文字列にしないこと
 *    （`length === 0` の 1 か所で判定できるようにしてある）。
 */

/** 金額を持つ最小限の形。履歴の行と集金レコードのどちらでも通る */
type FundLike = {
  totalFunds?: number | null;
  /** ⚠️ 古い応答では `undefined`（永続キャッシュから復元される） */
  cashless?: CashlessEntry[] | null;
};

export function methodLabel(key: string): string {
  return key === CASH_METHOD_KEY ? "現金" : key.replace(/^method:/, "");
}

/**
 * 集金 1 件の支払方法ごとの内訳。
 *
 * ⚠️ **現金は引き算で出す。** `payment_methods` に現金の行は無く、
 *    `totalFunds` は現金 + キャッシュレスの総額として保存されている。
 * ⚠️ **0 円は落とす。** 使っていない方法まで並ぶと行が読めなくなる。
 * ⚠️ **現金が負になり得る**（過去データのずれ）。0 に丸めず、そのまま出さない
 *    ことで「合計と合わない」に気づけるようにしておく。
 */
export function methodBreakdown(item: FundLike): { key: string; label: string; amount: number }[] {
  const cashless = item.cashless ?? [];
  const out: { key: string; label: string; amount: number }[] = [];
  let sum = 0;

  for (const entry of cashless) {
    const amount = entry?.amount ?? 0;
    const name = String(entry?.name ?? "").trim();
    if (!name || amount === 0) continue;
    const key = methodKeyOf(name);
    // 同じ名前が 2 行あることは無い想定だが、あっても 1 行にまとめる
    const found = out.find((row) => row.key === key);
    if (found) found.amount += amount;
    else out.push({ key, label: name, amount });
    sum += amount;
  }

  const cash = (item.totalFunds ?? 0) - sum;
  if (cash !== 0) out.unshift({ key: CASH_METHOD_KEY, label: "現金", amount: cash });
  return out;
}

/** その集金が持っている支払方法のキー */
export function methodKeysOf(item: FundLike): string[] {
  return methodBreakdown(item).map((row) => row.key);
}

/**
 * 絞り込みに一致するか。
 *
 * ⚠️ **「含む」で判定する（一致ではない）。** 現金と PayPay の両方で受け取った
 *    集金は、どちらで絞っても出る。**行に出す金額は総額のまま**なので、
 *    絞り込んだ合計と行の和は一致しない。画面で内訳を必ず見せること。
 */
export function matchesMethods(item: FundLike, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const keys = methodKeysOf(item);
  return selected.some((key) => keys.includes(key));
}

/** 選択中の支払方法の見出し。⚠️ 0 件（＝絞らない）のときは呼ばない */
export function methodsLabel(selected: string[]): string {
  if (selected.length === 1) return methodLabel(selected[0]);
  return `${selected.length}種類`;
}
