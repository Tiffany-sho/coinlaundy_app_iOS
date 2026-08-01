import { monthIndexFromEpoch, monthKey, type MonthIndex, type MonthRange } from "@/components/revenue/monthIndex";
import type { MonthlyChartPoint, StoreRevenue } from "@/api/types";
import type { StackedPoint } from "@/components/revenue/charts";

/**
 * 月別売上の棒を組み立てる純関数。
 *
 * ⚠️ 見た目は `charts.tsx`、組み立てはここ、と分けてある（`historyRows.ts` と同じ方針）。
 *    条件分岐を追うときはこちらだけ読めば足りる。
 */

/** グラフに出す店舗。色は呼び出し側（売上の多い順）が決める */
export type VisibleStore = { store: StoreRevenue };

/**
 * 選んだ期間ぶんの月を**必ず全部**並べる。
 * ⚠️ データのある月だけ並べると歯抜けになり、棒の間隔が月と対応しなくなる。
 */
export function buildStackedPoints(
  rows: MonthlyChartPoint[] | undefined,
  range: MonthRange,
  visible: VisibleStore[],
  /**
   * 集金回数を出すか。
   * ⚠️ **店舗を絞っているときは false。** `byStore` は金額しか持たないので、
   *    絞り込み中の回数は内訳から出せない（0 を入れて「—」扱いにする）。
   */
  withCount: boolean
): StackedPoint[] {
  const byMonth = new Map((rows ?? []).map((point) => [point.month, point]));
  const out: StackedPoint[] = [];

  for (let i = range.start; i <= range.end; i += 1) {
    const key = monthKey(i);
    const point = byMonth.get(key);
    const parts: Record<string, number> = {};
    let total = 0;

    for (const { store } of visible) {
      const amount = point?.byStore?.[store.laundryId] ?? 0;
      if (amount === 0) continue;
      parts[store.laundryId] = amount;
      total += amount;
    }

    out.push({ month: key, total, count: withCount ? (point?.count ?? 0) : 0, parts });
  }
  return out;
}

/**
 * 組織で最初に集金があった月。1 件も無ければ null。
 *
 * ⚠️ グラフを過去へ送れる下限に使う。無いと空のグラフを無限にめくれてしまう。
 * ⚠️ `firstDate` は **JST 深夜 0 時の epoch**。端末 TZ で読むと月初で 1 か月ずれる。
 * ⚠️ **数値であることまで確かめる。** 永続キャッシュ（MMKV）に `firstDate` を
 *    持たない古い応答が残っていることがある（`docs/traps.md` の react-query）。
 */
export function oldestMonth(stores: StoreRevenue[]): MonthIndex | null {
  let oldest: MonthIndex | null = null;
  for (const store of stores) {
    if (typeof store.firstDate !== "number" || !Number.isFinite(store.firstDate)) continue;
    const index = monthIndexFromEpoch(store.firstDate);
    if (oldest === null || index < oldest) oldest = index;
  }
  return oldest;
}

/** 月ごとの「1 回あたり平均集金額」 */
export type AveragePoint = {
  month: string;
  total: number;
  count: number;
  /** ⚠️ 集金が 1 件も無い月は 0。棒を描かず、読み取りでは「集金なし」と出す */
  average: number;
};

/**
 * 1 回あたり平均を月ごとに組み立てる。
 *
 * ⚠️ **割るのは `count`（集金回数）。`storeCount` で割らない。**
 *    ホームの「1回あたり平均」と同じ式（本家 `SalesCardClient.jsx` の `FundsDisplay`）。
 * ⚠️ **`rows` は `storeId` 付きで取ったものであること。** 組織全体の応答を渡すと
 *    `count` が全店舗の回数になり、1 回あたりが実際より小さく出る。
 * ⚠️ **集金の無い月も並べる。** 落とすと x 軸の間隔が月と対応しなくなり、
 *    「3 か月空いた」ことが読めなくなる。
 */
export function buildAveragePoints(
  rows: MonthlyChartPoint[] | undefined,
  range: MonthRange
): AveragePoint[] {
  const byMonth = new Map((rows ?? []).map((point) => [point.month, point]));
  const out: AveragePoint[] = [];

  for (let i = range.start; i <= range.end; i += 1) {
    const key = monthKey(i);
    const point = byMonth.get(key);
    const total = point?.total ?? 0;
    const count = point?.count ?? 0;
    // ⚠️ 0 除算を避ける
    out.push({ month: key, total, count, average: count > 0 ? Math.round(total / count) : 0 });
  }
  return out;
}
