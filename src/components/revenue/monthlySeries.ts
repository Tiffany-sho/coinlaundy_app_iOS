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
 * 選んだ支払方法だけの棒を組み立てる。**複数選べる**（積み上げになる）。
 *
 * ⚠️ **店舗別の内訳とは両立しない。** 応答の `byStore`（金額）と `byMethod` は
 *    それぞれ独立した畳み方で、「この店舗の PayPay」は**データとして存在しない。**
 *    したがって方法で絞るときは店舗の積み上げを捨て、1 色の棒にする。
 *    呼び出し側は**店舗の選択を必ず解除する**こと（黙って無視すると、
 *    絞っているつもりの店舗が数字に反映されない）。
 *
 * ⚠️ **`count` は常に 0（＝「—」表示）にする。** `count` は「その月の集金回数」で、
 *    支払方法ごとには分かれていない。入れると「PayPay で 8 回」と読めてしまう。
 *
 * ⚠️ **`byMethod` は古い応答だと `undefined`。** react-query の永続キャッシュが
 *    最大 7 日ぶん前のバージョンの応答を返すため、`?? {}` を通すこと。
 */
export function buildMethodPoints(
  rows: MonthlyChartPoint[] | undefined,
  range: MonthRange,
  methodKeys: string[]
): StackedPoint[] {
  const byMonth = new Map((rows ?? []).map((point) => [point.month, point]));
  const out: StackedPoint[] = [];

  for (let i = range.start; i <= range.end; i += 1) {
    const key = monthKey(i);
    const byMethod = byMonth.get(key)?.byMethod ?? {};
    const parts: Record<string, number> = {};
    let total = 0;

    /*
      ⚠️ **選んだぶんだけを足す。** 複数選べるので、棒は選んだ方法の
         積み上げになる。`total` を応答の `total` にしないこと
         （絞っていない方法まで含んでしまう）。
    */
    for (const methodKey of methodKeys) {
      const amount = byMethod[methodKey] ?? 0;
      if (amount !== 0) parts[methodKey] = amount;
      total += amount;
    }

    out.push({ month: key, total, count: 0, parts });
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

/*
  「1 回あたり平均」（`buildAveragePoints` / `AveragePoint`）は 2026-08-03 に外した。
  店舗別の収益ページの「1回あたり」タブ専用で、他に使い手が無かったため。
  ⚠️ ホームの「1回あたり平均」は別物で、そちらは今も出ている
     （`MonthlySalesCarousel`。式は **月の集金金額 ÷ 集金回数**）。
*/
