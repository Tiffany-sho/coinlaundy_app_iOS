import {
  monthIndexFromEpoch,
  monthKey,
  monthLabel,
  type MonthIndex,
} from "@/components/revenue/monthIndex";
import type { Expense } from "@/api/types";

/**
 * 経費を月ごとに束ねる（純関数）。
 *
 * ⚠️ 円グラフを**月ごとに**出すため。期間をまとめて 1 枚にすると、
 *    「先月は修繕費が重かった」のような**月の癖が平均に溶けて見えなくなる。**
 */
export type MonthGroup = {
  index: MonthIndex;
  /** "YYYY-MM"。⚠️ React の key に使う（ラベルは重複し得ないが月番号のほうが安全） */
  key: string;
  label: string;
  total: number;
  items: Expense[];
};

/**
 * 期間内の月を**すべて**返す（新しい順）。
 *
 * ⚠️ **経費が 1 件も無い月も返す。** 落とすと「さらに見る」を押しても
 *    画面が何も変わらないことがあり、**壊れているように見える。**
 *    呼び出し側で「¥0」の行として細く出すこと。
 *
 * ⚠️ **月の中の並びは触らない。** サーバが実体と展開した固定費を混ぜてから
 *    日付の新しい順に並べている（`getExpenses`）。並べ直すとその順が崩れる。
 *
 * ⚠️ **金額が数値であることまで確かめる**（永続キャッシュから項目の欠けた
 *    応答が復元されると合計が NaN になり、そのまま画面に出る）。
 */
export function buildMonthGroups(
  items: Expense[] | undefined,
  from: MonthIndex,
  to: MonthIndex
): MonthGroup[] {
  const byMonth = new Map<MonthIndex, Expense[]>();

  for (const expense of items ?? []) {
    if (!Number.isFinite(expense?.date)) continue;
    const index = monthIndexFromEpoch(expense.date);
    const list = byMonth.get(index);
    if (list) list.push(expense);
    else byMonth.set(index, [expense]);
  }

  const out: MonthGroup[] = [];
  // 新しい順。⚠️ 一覧の並び（新しい順）と揃える
  for (let index = to; index >= from; index -= 1) {
    const monthItems = byMonth.get(index) ?? [];
    out.push({
      index,
      key: monthKey(index),
      label: monthLabel(index),
      total: monthItems.reduce(
        (sum, e) => sum + (Number.isFinite(e?.amount) ? e.amount : 0),
        0
      ),
      items: monthItems,
    });
  }
  return out;
}
