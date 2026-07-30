import type { LegalDocument } from "./types";
import { TERMS } from "./terms";
import { PRIVACY } from "./privacy";

export type { LegalBlock, LegalDocument, LegalSection } from "./types";

/**
 * アプリ内に持っている法務文書。
 *
 * ⚠️ **正本は Web リポジトリ側。同期の義務については ./types.ts の先頭を読むこと。**
 *
 * ⚠️ **特商法（/tokushoho）はここに足さない。** 販売価格と決済条件を必ず書く
 *    性質の文書で、アプリに載せると Guideline 3.1.3(a) に触れる。
 *    アプリ内課金である以上、アプリに掲示義務も生じない。
 */
export const LEGAL_DOCUMENTS = {
  terms: TERMS,
  privacy: PRIVACY,
} as const satisfies Record<string, LegalDocument>;

export type LegalPageKey = keyof typeof LEGAL_DOCUMENTS;

export function isLegalPageKey(value: unknown): value is LegalPageKey {
  return typeof value === "string" && value in LEGAL_DOCUMENTS;
}
