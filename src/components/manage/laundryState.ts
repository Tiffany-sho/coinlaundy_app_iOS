import type { ExtraStock, LaundryState, MachineState } from "@/api/types";
import { makeUuid } from "@/shared/uuid";

/**
 * laundry_state（在庫・設備）の読み方をまとめたもの。
 *
 * ⚠️ 形と既定値は**すべて Web に合わせてある**。推測で決めないこと。根拠は次の 3 箇所。
 *
 *   1. `supabaseFunctions/supabaseDatabase/laundryState/action.js` の updateStockState()
 *      未指定のとき `extra_stocks: []` / `stock_thresholds: { detergent: 1, softener: 1 }`
 *      を書き込む。→ 既定の警告ラインは 1。
 *      **省略した項目は既定値で上書きされる**ので、保存時は 4 項目を必ず全部送ること。
 *      洗剤と柔軟剤だけ送ると、その店舗の追加在庫と警告ラインが消える。
 *
 *   2. `feacher/inventory/InventoryStoreCard.jsx`
 *      追加在庫の 1 件は { id, name, count, threshold }。
 *      追加時の初期値は { id: uuid, name: "", count: 0, threshold: 1 }。
 *      名前が空のときの表示は「—」（一覧）/「（名前なし）」（編集）。
 *
 *   3. `feacher/inventory/InventoryClientPage.jsx` と action.js の getStockStates()
 *      警告の判定は「以下」＝ `count <= (threshold ?? 1)`。「未満」ではない。
 */

/** 警告ラインの既定値。Web の updateStockState() が書き込む値と揃える */
export const DEFAULT_STOCK_THRESHOLD = 1;

/** 警告ラインの単位。Web の ThresholdControl は「{n}個以下で警告」と出す */
export const STOCK_UNIT = "個";

export type StockThresholds = { detergent: number; softener: number };

/** 在庫サマリの 1 行。洗剤・柔軟剤・追加在庫を同じ形に均す */
export type StockDisplayItem = { label: string; value: number; isLow: boolean };

/** stock_thresholds は null / 一部欠けがありうるので必ずここを通して読む */
export function readThresholds(state: LaundryState): StockThresholds {
  const thresholds = state.stock_thresholds ?? {};
  return {
    detergent: thresholds.detergent ?? DEFAULT_STOCK_THRESHOLD,
    softener: thresholds.softener ?? DEFAULT_STOCK_THRESHOLD,
  };
}

/** extra_stocks も null がありうる。threshold は 1 件ごとに欠けうる */
export function readExtraStocks(state: LaundryState): ExtraStock[] {
  return (state.extra_stocks ?? []).map((item) => ({
    ...item,
    threshold: item.threshold ?? DEFAULT_STOCK_THRESHOLD,
  }));
}

/** 在庫不足かどうか。判定は「以下」（Web の getStockStates と同じ） */
export function isLowStock(state: LaundryState): boolean {
  const thresholds = readThresholds(state);
  return (
    (state.detergent ?? 0) <= thresholds.detergent ||
    (state.softener ?? 0) <= thresholds.softener ||
    readExtraStocks(state).some((item) => item.count <= (item.threshold ?? DEFAULT_STOCK_THRESHOLD))
  );
}

/** カードに並べる在庫の行。順番は Web の displayItems と同じ（洗剤 → 柔軟剤 → 追加分） */
export function stockDisplayItems(state: LaundryState): StockDisplayItem[] {
  const thresholds = readThresholds(state);
  return [
    {
      label: "洗剤",
      value: state.detergent ?? 0,
      isLow: (state.detergent ?? 0) <= thresholds.detergent,
    },
    {
      label: "柔軟剤",
      value: state.softener ?? 0,
      isLow: (state.softener ?? 0) <= thresholds.softener,
    },
    ...readExtraStocks(state).map((item) => ({
      // 名前が空のときの「—」は Web の displayItems と同じ
      label: item.name || "—",
      value: item.count,
      isLow: item.count <= (item.threshold ?? DEFAULT_STOCK_THRESHOLD),
    })),
  ];
}

export function brokenMachines(state: LaundryState): MachineState[] {
  return (state.machines ?? []).filter((machine) => machine.break);
}

/** 在庫不足か故障機があるか。店舗一覧の「要対応」の絞り込みに使う */
export function needsAttention(state: LaundryState): boolean {
  return isLowStock(state) || brokenMachines(state).length > 0;
}

/**
 * 追加在庫の新規 1 件。
 * Web の addExtraItem と同じ初期値（名前は空、個数 0、警告ライン 1）。
 */
export function makeExtraStock(): ExtraStock {
  return { id: makeUuid(), name: "", count: 0, threshold: DEFAULT_STOCK_THRESHOLD };
}

