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
  proplus: "com.collecie.app.proplus.monthly",
  max: "com.collecie.app.max.monthly",
};

/** fetchProducts に渡す並び。画面の並び順もこれに従う */
export const PURCHASABLE_PLANS = ["pro", "proplus", "max"] as const;
export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

export const PRODUCT_ID_LIST: string[] = PURCHASABLE_PLANS.map((p) => PRODUCT_IDS[p]);

export const PLAN_BY_PRODUCT_ID: Record<string, PurchasablePlan> = Object.fromEntries(
  PURCHASABLE_PLANS.map((plan) => [PRODUCT_IDS[plan], plan])
);

export const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  proplus: "Pro+",
  max: "Max",
};

/**
 * 店舗数の上限。Web の src/functions/plans.js と同じ値（null = 無制限）。
 * ⚠️ **表示専用。** 判定の正は Server Action（`PLAN_LIMITS`）。
 */
export const PLAN_STORE_LIMIT: Record<string, number | null> = {
  free: 3,
  pro: 5,
  proplus: 10,
  max: null,
};

/**
 * プランの序列。アップグレードかダウングレードかの判定に使う。
 * ⚠️ 価格はここに書かない。**表示する価格は必ず StoreKit が返した
 *    `displayPrice` を使うこと。** ハードコードすると、為替や地域、
 *    Apple の価格改定で実際の請求額と食い違い、Guideline 3.1.2 に触れる。
 */
export const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, proplus: 2, max: 3 };

export function isUpgrade(from: string, to: string): boolean {
  return (PLAN_RANK[to] ?? 0) > (PLAN_RANK[from] ?? 0);
}

/**
 * `plan` が `min` 以上か。**有料機能の出し分けはこれを通すこと。**
 *
 * ⚠️ **`plan === "pro" || plan === "max"` と書かない。** プランを足すたびに
 *    出し分けを全部直して回ることになり、**直し漏れた画面だけ機能が消える。**
 *    2026-08-03 に Pro+ を足したとき、書き出しボタンが 2 画面とも Pro+ を
 *    弾いていた（サーバは `plan === "free"` で判定しているので**通るのに
 *    ボタンが出ない**、という食い違い方をする）。
 * ⚠️ これは表示の出し分けだけ。可否の正は Server Action。
 */
export function planAtLeast(plan: string, min: string): boolean {
  return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[min] ?? 0);
}
