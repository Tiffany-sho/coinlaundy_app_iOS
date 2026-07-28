import type { FundEntry } from "@/offline/types";

/**
 * ⚠️ Web の CheckDialogCollectMoney.jsx からの移植（コピー運用）。
 * 金額の計算式がずれると集金額が狂うので、変更時は必ず Web と同時に直すこと。
 */

/** 100 円硬貨 1 枚の重量（g） */
export const COIN_WEIGHT = 4.8;

/** 硬貨 1 枚あたりの金額 */
export const COIN_VALUE = 100;

/** 重量（g）から硬貨の枚数へ。端数は切り上げる（Web と同じ Math.ceil） */
export function weightToCoins(weightGram: number): number {
  if (!Number.isFinite(weightGram) || weightGram <= 0) return 0;
  return Math.ceil(weightGram / COIN_WEIGHT) || 0;
}

/** 明細から合計金額を出す。枚数の合計 × 100 */
export function calcTotalFunds(fundsArray: FundEntry[]): number {
  return fundsArray.reduce((sum, entry) => sum + (entry.funds || 0), 0) * COIN_VALUE;
}

/** 1 行あたりの金額 */
export function entryAmount(entry: FundEntry): number {
  return (entry.funds || 0) * COIN_VALUE;
}
