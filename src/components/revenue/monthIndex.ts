import { getEpochTimeInSeconds, nowInJst } from "@/shared/date";

/**
 * 「年 * 12 + (月 - 1)」の通し番号。月またぎを素朴な加減算で書けるようにするためのもの。
 * 収益まわりで期間を扱うところは全部これに揃える。
 */
export type MonthIndex = number;

export type MonthRange = { start: MonthIndex; end: MonthIndex };

export function toMonthIndex(year: number, month: number): MonthIndex {
  return year * 12 + (month - 1);
}

export function fromMonthIndex(index: MonthIndex): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** JST の今月。端末 TZ で数えると月末深夜に 1 か月ずれる */
export function currentMonthIndex(): MonthIndex {
  const now = nowInJst();
  return now.getFullYear() * 12 + now.getMonth();
}

/** その月の 1 日 0 時（JST）の epoch。⚠️ 自前で計算せず共通ヘルパに通すこと */
export function monthStartEpoch(index: MonthIndex): number {
  const { year, month } = fromMonthIndex(index);
  return getEpochTimeInSeconds(year, month, 1);
}

/**
 * JST 深夜 0 時の epoch（`collect_funds.date` と同じ形）が属する月。
 *
 * ⚠️ **数値だけで組み立てる。** `toLocaleString` を経由すると Hermes で
 *    Invalid Date になる（docs/traps.md の Hermes）。
 * ⚠️ epoch は `Date.UTC(y, m, d) - 9h` なので、9 時間足してから UTC で読む。
 */
export function monthIndexFromEpoch(epoch: number): MonthIndex {
  const d = new Date(epoch + 32_400_000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** "YYYY-MM"。BFF が返す month と突き合わせるキー */
export function monthKey(index: MonthIndex): string {
  const { year, month } = fromMonthIndex(index);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthLabel(index: MonthIndex): string {
  const { year, month } = fromMonthIndex(index);
  return `${year}年${month}月`;
}
