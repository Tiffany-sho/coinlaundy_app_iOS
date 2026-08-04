import type { LegalDocument } from "./types";
import { TERMS } from "./terms";
import { PRIVACY } from "./privacy";
import { TOKUSHOHO } from "./tokushoho";

export type { LegalBlock, LegalDocument, LegalSection } from "./types";

/**
 * アプリ内に持っている法務文書。
 *
 * ⚠️ **正本は Web リポジトリ側。同期の義務については ./types.ts の先頭を読むこと。**
 *
 * ⚠️ **特商法は 2026-08-05 に追加した（`tokushoho.ts`）。**
 *    ⚠️ **Web の `/tokushoho` の複製ではない。アプリ専用に書き下ろしたもの。**
 *       あちらは Stripe 決済（当方が販売者）を前提に販売価格と決済条件を書いており、
 *       そのまま載せると外部での購入条件の提示になる（Guideline 3.1.3(a)）。
 *       **写経しないこと。**
 *    ⚠️ **配信地域を日本のみに限定していることが前提。** 販売価格を円で固定して
 *       いるので、他の地域へ広げた瞬間に表示額と請求額が食い違う（3.1.2）。
 *       広げるときは必ず `tokushoho.ts` の先頭を読むこと。
 *
 *    ⚠️ 「アプリ内課金が無いから掲示義務が無い」という理由は 2026-07-29 に失効している
 *       （IAP を入れたため）。載せない選択も可能だったが、日本限定配信にしたことで
 *       価格を正しく書けるようになったため載せる側に倒した。
 */
export const LEGAL_DOCUMENTS = {
  terms: TERMS,
  privacy: PRIVACY,
  tokushoho: TOKUSHOHO,
} as const satisfies Record<string, LegalDocument>;

export type LegalPageKey = keyof typeof LEGAL_DOCUMENTS;

export function isLegalPageKey(value: unknown): value is LegalPageKey {
  return typeof value === "string" && value in LEGAL_DOCUMENTS;
}
