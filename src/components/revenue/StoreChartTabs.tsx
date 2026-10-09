import { useState } from "react";
import { useBootstrap } from "@/api/queries";
import { MonthlyRevenueCard } from "@/components/revenue/MonthlyRevenueCard";
import { MonthlyProfitCard } from "@/components/revenue/MonthlyProfitCard";
import { MachineBreakdownCard } from "@/components/revenue/MachineBreakdownCard";
import { expensesEnabled } from "@/components/expenses/expensesEnabled";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import type { StoreRevenue } from "@/api/types";

/**
 * グラフカードの切り替えタブ。⚠️ 既定は「月別」
 *
 * ⚠️ **「月次サマリー」は 2026-08-03 に「月別利益」へ差し替えた**（全体版と同時）。
 * ⚠️ **経費を使わない組織では「月別利益」を出さない。** 経費が常に 0 になり、
 *    月別売上と同じ形の棒が 2 枚並ぶだけになる。
 */
type ChartTab = "monthly" | "machines" | "profit";

const CHART_TABS: { value: ChartTab; label: string }[] = [
  { value: "monthly", label: "月別" },
  { value: "machines", label: "機器別" },
  { value: "profit", label: "月別利益" },
];

/**
 * 店舗別の収益ページのグラフ部分。1 枚ずつタブで出す。
 *
 * 組織全体版（収益タブ）は「店舗別 / 月別 / 月別利益」の 3 枚だが、店舗が 1 軒に
 * 固定されると店舗別の軸が消える。代わりに**その店舗の中の傾向**（機器別）を出す。
 *
 * ⚠️ スマホ幅では縦に積むと売上履歴まで遠くなるので、全体版と同じく 1 枚だけ出す。
 */
export function StoreChartTabs({
  storeRevenue,
  revenueLoading,
  storeId,
}: {
  storeRevenue: StoreRevenue[];
  revenueLoading: boolean;
  /**
   * この画面が見ている店舗。
   * ⚠️ **グラフに必ず渡すこと。** 省くと月別売上の「◯回」が組織全体の集金回数になる
   *    （金額は byStore から取れるが、**回数は店舗ごとに分かれていない**）。
   *    月別利益も同様で、省くと組織全体の売上と経費が出る。
   */
  storeId: string;
}) {
  const [tab, setTab] = useState<ChartTab>("monthly");
  const bootstrap = useBootstrap();

  const useExpenses = expensesEnabled(bootstrap.data?.organization);
  /* ⚠️ 経費を切った直後に「月別利益」を選んだままにしない（タブごと消えるため） */
  const activeTab: ChartTab = tab === "profit" && !useExpenses ? "monthly" : tab;
  const visibleTabs = useExpenses ? CHART_TABS : CHART_TABS.filter((t) => t.value !== "profit");

  return (
    <>
      <SegmentedTabs options={visibleTabs} value={activeTab} onChange={setTab} />

      {activeTab === "monthly" && (
        <MonthlyRevenueCard
          stores={storeRevenue}
          isLoading={revenueLoading}
          storeId={storeId}
        />
      )}

      {activeTab === "machines" && (
        <MachineBreakdownCard stores={storeRevenue} storeId={storeId} isLoading={revenueLoading} />
      )}

      {activeTab === "profit" && (
        <MonthlyProfitCard stores={storeRevenue} isLoading={revenueLoading} storeId={storeId} />
      )}
    </>
  );
}
