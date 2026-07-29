import type { PlanKey } from "@/api/types";

/**
 * App Store Connect で作る自動更新サブスクリプションの定義。
 *
 * ⚠️ **同じ定義が Web 側の `src/functions/applePlans.js` にもある。**
 *    リポジトリを跨いでいるので片方だけ直すと、購入は成立するのにプランが
 *    上がらない状態になる（サーバの PLAN_BY_PRODUCT_ID の引きが外れる）。
 *    型エラーにならないので必ず両方同時に直すこと。
 *
 * ⚠️ 商品 ID は App Store Connect で一度作ると**変更も再利用もできない**。
 *    作る前にこの文字列で確定させること。
 */
export const PRODUCT_IDS: Record<Exclude<PlanKey, "free">, string> = {
  pro: "com.collecie.app.pro.monthly",
  max: "com.collecie.app.max.monthly",
};

/** fetchProducts に渡す並び。画面の並び順もこれに従う */
export const PURCHASABLE_PLANS = ["pro", "max"] as const;
export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

export const PRODUCT_ID_LIST: string[] = PURCHASABLE_PLANS.map((p) => PRODUCT_IDS[p]);

export const PLAN_BY_PRODUCT_ID: Record<string, PurchasablePlan> = Object.fromEntries(
  PURCHASABLE_PLANS.map((plan) => [PRODUCT_IDS[plan], plan])
);

export const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  max: "Max",
};

/** 店舗数の上限。Web の src/functions/plans.js と同じ値（null = 無制限） */
export const PLAN_STORE_LIMIT: Record<string, number | null> = {
  free: 3,
  pro: 5,
  max: null,
};

/**
 * プランの序列。アップグレードかダウングレードかの判定に使う。
 * ⚠️ 価格はここに書かない。**表示する価格は必ず StoreKit が返した
 *    `displayPrice` を使うこと。** ハードコードすると、為替や地域、
 *    Apple の価格改定で実際の請求額と食い違い、Guideline 3.1.2 に触れる。
 */
export const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, max: 2 };

export function isUpgrade(from: string, to: string): boolean {
  return (PLAN_RANK[to] ?? 0) > (PLAN_RANK[from] ?? 0);
}
