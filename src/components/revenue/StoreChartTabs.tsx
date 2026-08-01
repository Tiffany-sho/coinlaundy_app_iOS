import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { MonthlyRevenueCard } from "@/components/revenue/MonthlyRevenueCard";
import { MonthlySummaryTable } from "@/components/revenue/MonthlySummaryTable";
import { AveragePerCollectCard } from "@/components/revenue/AveragePerCollectCard";
import { MachineBreakdownCard } from "@/components/revenue/MachineBreakdownCard";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { Card, Muted } from "@/components/common/ui";
import type { MonthlyPoint, StoreRevenue } from "@/api/types";
import { color, font, spacing } from "@/theme/tokens";

/** グラフカードの切り替えタブ。⚠️ 既定は「月別」 */
type ChartTab = "monthly" | "average" | "machines" | "summary";

const CHART_TABS: { value: ChartTab; label: string }[] = [
  { value: "monthly", label: "月別" },
  { value: "average", label: "1回あたり" },
  { value: "machines", label: "機器別" },
  { value: "summary", label: "サマリー" },
];

/**
 * 店舗別の収益ページのグラフ部分。1 枚ずつタブで出す。
 *
 * 組織全体版（収益タブ）は「店舗別 / 月別 / 月次サマリー」の 3 枚だが、店舗が 1 軒に
 * 固定されると店舗別の軸が消える。代わりに**その店舗の中の傾向**（1回あたり）を出す。
 *
 * ⚠️ スマホ幅では縦に積むと売上履歴まで遠くなるので、全体版と同じく 1 枚だけ出す。
 */
export function StoreChartTabs({
  storeRevenue,
  revenueLoading,
  points,
  storeId,
}: {
  storeRevenue: StoreRevenue[];
  revenueLoading: boolean;
  /** 月次サマリー用。⚠️ こちらは過去 2 年固定（/funds/summary/monthly） */
  points: MonthlyPoint[];
  /**
   * この画面が見ている店舗。
   * ⚠️ **グラフに必ず渡すこと。** 省くと「◯回」と「1 回あたり」が
   *    組織全体の集金回数で計算される（金額は byStore から取れるが回数は取れない）。
   */
  storeId: string;
}) {
  const [tab, setTab] = useState<ChartTab>("monthly");

  return (
    <>
      <SegmentedTabs options={CHART_TABS} value={tab} onChange={setTab} />

      {tab === "monthly" && (
        <MonthlyRevenueCard
          stores={storeRevenue}
          isLoading={revenueLoading}
          storeId={storeId}
        />
      )}

      {tab === "average" && (
        <AveragePerCollectCard
          stores={storeRevenue}
          storeId={storeId}
          isLoading={revenueLoading}
        />
      )}

      {tab === "machines" && (
        <MachineBreakdownCard stores={storeRevenue} storeId={storeId} isLoading={revenueLoading} />
      )}

      {/* ⚠️ 月次サマリーはデータが無いと何も描かない（カードごと消える）ので代わりを出す */}
      {tab === "summary" &&
        (points.length > 0 ? (
          <MonthlySummaryTable data={points} />
        ) : (
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={styles.cardTitle}>月次サマリー</Text>
            <Muted>集計できる月がありません</Muted>
          </Card>
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    fontFamily: font.uiBold,
    fontSize: 14,
    color: color.tealDeeper,
    marginBottom: spacing.xs,
  },
});
