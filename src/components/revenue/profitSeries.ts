import { monthIndexFromEpoch, monthKey, type MonthRange } from "@/components/revenue/monthIndex";
import type { Expense, MonthlyChartPoint } from "@/api/types";

/**
 * 月別利益（売上 − 経費）の棒を組み立てる純関数。
 *
 * ⚠️ 見た目は `charts.tsx` の `ProfitBarChart`、組み立てはここ、と分けてある
 *    （`monthlySeries.ts` と同じ方針）。条件分岐を追うときはこちらだけ読めば足りる。
 *
 * ⚠️ **同じ計算が Web にもある**（`src/functions/expenseSummary.js` の
 *    `buildProfitPoints`）。**片方だけ直すと同じ月の利益が Web とアプリで
 *    食い違う。**型エラーは出ない。
 */

export type ProfitPoint = {
  /** "YYYY-MM" */
  month: string;
  revenue: number;
  expense: number;
  /** ⚠️ **負になり得る。** 0 に丸めないこと（赤字の月を黒字に見せてしまう） */
  profit: number;
};

/**
 * 月ごとの経費合計。
 *
 * ⚠️ **展開された固定費（`recurring: true`）も足す。** 除くと家賃を含まない
 *    「経費」になり、利益が実際より大きく出る。
 * ⚠️ **`date` は JST 深夜 0 時の epoch。** 端末 TZ の `getMonth()` で数えると
 *    月初・月末の 1 件が隣の月に落ちる。
 */
export function expenseTotalsByMonth(expenses: Expense[] | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const expense of expenses ?? []) {
    /*
      ⚠️ **数値であることまで確かめる。** react-query の永続キャッシュ（MMKV）から
         古い応答が復元されると項目が欠けていることがあり、`undefined` を足すと
         合計が NaN になってそのまま画面に出る（docs/traps.md）。
    */
    const amount = expense?.amount;
    const date = expense?.date;
    if (!Number.isFinite(amount) || !Number.isFinite(date)) continue;
    const key = monthKey(monthIndexFromEpoch(date));
    out.set(key, (out.get(key) ?? 0) + amount);
  }
  return out;
}

/**
 * 選んだ期間ぶんの月を**必ず全部**並べる。
 *
 * ⚠️ データのある月だけ並べると歯抜けになり、棒の間隔が月と対応しなくなる
 *    （`buildStackedPoints` と同じ理由）。
 *
 * ⚠️ **収益は `/funds/chart` の `total`（＝総額）を使う。** 現金だけの額ではない。
 *    キャッシュレスを落とすと利益が実際より小さく出る。
 */
export function buildProfitPoints(
  rows: MonthlyChartPoint[] | undefined,
  expenses: Expense[] | undefined,
  range: MonthRange
): ProfitPoint[] {
  const revenueByMonth = new Map((rows ?? []).map((point) => [point.month, point.total ?? 0]));
  const expenseByMonth = expenseTotalsByMonth(expenses);

  const out: ProfitPoint[] = [];
  for (let i = range.start; i <= range.end; i += 1) {
    const key = monthKey(i);
    const revenue = revenueByMonth.get(key) ?? 0;
    const expense = expenseByMonth.get(key) ?? 0;
    out.push({ month: key, revenue, expense, profit: revenue - expense });
  }
  return out;
}

/** 期間の合計。⚠️ `profit` は `revenue - expense` と必ず一致する */
export function sumProfitPoints(points: ProfitPoint[]): {
  revenue: number;
  expense: number;
  profit: number;
} {
  let revenue = 0;
  let expense = 0;
  for (const point of points) {
    revenue += point.revenue;
    expense += point.expense;
  }
  return { revenue, expense, profit: revenue - expense };
}

/**
 * 利益率（%、小数第 1 位）。
 *
 * ⚠️ **売上が 0 のときは null。** 0 で割ると Infinity になり、画面に
 *    「Infinity%」が出る。経費だけ入れて集金がまだ無い月は普通に起こる。
 */
export function profitMargin(revenue: number, profit: number): number | null {
  if (!Number.isFinite(revenue) || revenue <= 0) return null;
  return Math.round((profit / revenue) * 1000) / 10;
}
