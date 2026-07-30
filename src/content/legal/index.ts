import type { LegalDocument } from "./types";
import { TERMS } from "./terms";
import { PRIVACY } from "./privacy";

export type { LegalBlock, LegalDocument, LegalSection } from "./types";

/**
 * アプリ内に持っている法務文書。
 *
 * ⚠️ **正本は Web リポジトリ側。同期の義務については ./types.ts の先頭を読むこと。**
 *
 * ⚠️ **特商法（/tokushoho）はここに足さない。** Web の当該ページは Stripe 決済
 *    （当方が販売者）を前提に販売価格と決済条件を書いており、そのままアプリに
 *    載せると外部での購入条件を提示することになる（Guideline 3.1.3(a)）。
 *
 *    ⚠️ **「アプリ内課金が無いから掲示義務が無い」という理由は 2026-07-29 に失効した。**
 *       IAP を入れたため。現在の理由は「App Store 経由の購読では Apple が
 *       販売者（merchant of record）になる」こと。⚠️ **これは法務の判断なので、
 *       審査提出前に確認すること。** 必要なら IAP 前提で書き直した版を別途作る
 *       （Web の /tokushoho をそのまま持ってこないこと）。
 */
export const LEGAL_DOCUMENTS = {
  terms: TERMS,
  privacy: PRIVACY,
} as const satisfies Record<string, LegalDocument>;

export type LegalPageKey = keyof typeof LEGAL_DOCUMENTS;

export function isLegalPageKey(value: unknown): value is LegalPageKey {
  return typeof value === "string" && value in LEGAL_DOCUMENTS;
}
