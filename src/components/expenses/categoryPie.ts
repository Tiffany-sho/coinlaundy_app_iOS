import { categoryColor } from "@/components/expenses/categories";
import type { Expense } from "@/api/types";

/**
 * カテゴリ別の円グラフの組み立て（純関数）。
 *
 * ⚠️ 見た目は `CategoryPie.tsx`、組み立てはここ、と分けてある
 *    （`monthlySeries.ts` / `profitSeries.ts` と同じ方針）。
 *
 * ⚠️ **`react-native-svg` は入っていない。** 足すとネイティブモジュールなので
 *    **EAS の再ビルドが要る**（`docs/traps.md` の EAS）。円は View だけで描く。
 *    そのために「0〜180 度までの扇」を単位にして、180 を超える分は分割する。
 */

export type CategorySlice = {
  category: string;
  total: number;
  /** 0〜100。⚠️ 表示用に丸めてあるので、合計が 100 にならないことがある */
  share: number;
  color: string;
};

/**
 * 円グラフの 1 片。**必ず 180 度以下**。
 *
 * ⚠️ **180 度を超える扇は View では 1 枚で描けない**（半円を回して見せる作りのため）。
 *    分割はここで済ませて、描く側は分岐を持たない。
 */
export type PieChunk = {
  key: string;
  color: string;
  /** 12 時から時計回りに何度の位置から始まるか */
  rotate: number;
  /** 何度ぶんか（0 < sweep <= 180） */
  sweep: number;
};

/**
 * カテゴリごとに畳んで金額の多い順に並べる。
 *
 * ⚠️ **展開された固定費（`recurring: true`）も数える。** 除くと家賃を含まない
 *    円グラフになり、経費合計と食い違う。
 * ⚠️ **金額が数値であることまで確かめる。** react-query の永続キャッシュから
 *    項目の欠けた応答が復元されると NaN が混ざる（`docs/traps.md`）。
 */
export function categorySlices(expenses: Expense[] | undefined): CategorySlice[] {
  const totals = new Map<string, number>();
  let sum = 0;

  for (const expense of expenses ?? []) {
    const amount = expense?.amount;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const category = expense.category ?? "その他";
    totals.set(category, (totals.get(category) ?? 0) + amount);
    sum += amount;
  }

  if (sum <= 0) return [];

  return [...totals.entries()]
    .map(([category, total]) => ({
      category,
      total,
      share: Math.round((total / sum) * 1000) / 10,
      color: categoryColor(category),
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * 扇を組み立てる。
 *
 * ⚠️ **角度は割合ではなく「累計金額」から出す。** 各片を丸めてから足すと、
 *    ずれが積もって**最後に隙間か重なりができる。**
 * ⚠️ **最後の 1 枚は必ず 360 度で終わらせる。** 丸めの残りで
 *    1 度に満たない隙間が出ると、円の縁に背景色の線が入る。
 */
export function pieChunks(slices: CategorySlice[]): PieChunk[] {
  const total = slices.reduce((sum, slice) => sum + slice.total, 0);
  if (total <= 0) return [];

  const out: PieChunk[] = [];
  let consumed = 0;
  let start = 0;

  slices.forEach((slice, i) => {
    consumed += slice.total;
    const end = i === slices.length - 1 ? 360 : (consumed / total) * 360;

    let angle = start;
    let remaining = end - start;
    /* ⚠️ 0.0001 で切る。浮動小数の残りかすで無限ループにしない */
    while (remaining > 0.0001) {
      const sweep = Math.min(remaining, 180);
      out.push({ key: `${slice.category}:${out.length}`, color: slice.color, rotate: angle, sweep });
      angle += sweep;
      remaining -= sweep;
    }
    start = end;
  });

  return out;
}
