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

/** "YYYY-MM"。BFF が返す month と突き合わせるキー */
export function monthKey(index: MonthIndex): string {
  const { year, month } = fromMonthIndex(index);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthLabel(index: MonthIndex): string {
  const { year, month } = fromMonthIndex(index);
  return `${year}年${month}月`;
}

/**
 * 収益グラフが遡れる上限。Web の SegmentedPeriod.jsx の MAX_MONTHS と同じ 60 か月（5 年）。
 *
 * ⚠️ 集金データを書き込む画面は、ここより古い日付を入力させないこと。
 *    入れても月別売上カードに出せず、「登録できたのにどこにも出てこない」状態になる。
 *    過去データの一括入力（app/backfill/[storeId].tsx）がこれを下限に使っている。
 *
 * ⚠️ 月次サマリー表はさらに狭く、BFF の /funds/summary/monthly が前年同月比のため
 *    過去 2 年に固定されている。2 年より前のぶんは月別売上カードにだけ出る。
 */
export const MAX_MONTHS_BACK = 60;

/**
 * 遡れるいちばん古い日。MAX_MONTHS_BACK か月前の 1 日 0 時（JST）の epoch。
 * 集金日の入力欄の下限として使う。
 */
export function earliestSelectableEpoch(): number {
  return monthStartEpoch(currentMonthIndex() - (MAX_MONTHS_BACK - 1));
}
