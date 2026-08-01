/**
 * 経費のカテゴリ。
 *
 * ⚠️ **Web の `src/app/api/supabaseFunctions/supabaseDatabase/expenses/action.js` の
 *    `EXPENSE_CATEGORIES` と同じ綴りにすること。** サーバが配列に含まれるかで弾くので、
 *    1 文字でもずれると「カテゴリが不正です」で登録できなくなる。
 *    ⚠️ 2 リポジトリに同じ文字列を持っている（商品 ID と同じ罠）。**片方だけ直さない。**
 */
export const EXPENSE_CATEGORIES = [
  "仕入れ",
  "水道光熱費",
  "家賃",
  "修繕費",
  "消耗品費",
  "通信費",
  "広告宣伝費",
  "支払手数料",
  "その他",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** 既定のカテゴリ。⚠️ 在庫の仕入れがいちばん多いので先頭に置いてある */
export const DEFAULT_CATEGORY: string = EXPENSE_CATEGORIES[0];

/**
 * カテゴリごとの色。グラフには使わないが、一覧で目印になる。
 * ⚠️ 未知のカテゴリ（あとから増やした・古いデータ）も来うるので、必ず既定色に落とすこと。
 */
const CATEGORY_COLOR: Record<string, string> = {
  仕入れ: "#0891B2",
  水道光熱費: "#F59E0B",
  家賃: "#8B5CF6",
  修繕費: "#EF4444",
  消耗品費: "#10B981",
  通信費: "#3B82F6",
  広告宣伝費: "#EC4899",
  支払手数料: "#6B7280",
  その他: "#94A3B8",
};

export function categoryColor(category: string): string {
  return CATEGORY_COLOR[category] ?? CATEGORY_COLOR["その他"];
}
