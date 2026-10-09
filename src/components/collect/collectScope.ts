/**
 * 集金で何を記録するか。
 *
 * ⚠️ **`/collect/[storeId]` の `scope` パラメータの値でもある。**
 *    文字列を変えるときは、遷移する側（店舗一覧・店舗詳細・ホームのクイックアクション）
 *    と受け取る側の両方を直すこと。**綴りを間違えても型エラーにならず、
 *    既定（both）に落ちるだけ**なので気づけない。
 */
export type CollectScope = "cash" | "cashless" | "both";

export const COLLECT_SCOPES = [
  { value: "cash", label: "現金" },
  { value: "cashless", label: "現金以外" },
  { value: "both", label: "両方" },
] as const satisfies readonly { value: CollectScope; label: string }[];

/**
 * URL パラメータを `CollectScope` に直す。
 *
 * ⚠️ **未指定は `"both"`（＝全部出す）。** 通知のディープリンクや古い
 *    ショートカットから scope 無しで開かれたときに、**入力欄が黙って
 *    消えている**状態を作らないため。絞るのは明示されたときだけ。
 */
export function toCollectScope(value: string | string[] | undefined): CollectScope {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "cash" || raw === "cashless" ? raw : "both";
}
