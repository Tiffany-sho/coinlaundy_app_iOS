import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { MonthlyRevenueCard } from "@/components/revenue/MonthlyRevenueCard";
import { MonthlySummaryTable } from "@/components/revenue/MonthlySummaryTable";
import {
  AveragePerCollectChart,
  WeekdayRevenueChart,
} from "@/components/revenue/StoreAnalysisCharts";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { Card, Muted } from "@/components/common/ui";
import type { FundListItem, MonthlyPoint, StoreRevenue } from "@/api/types";
import { color, font, spacing } from "@/theme/tokens";

/** グラフカードの切り替えタブ。⚠️ 既定は「月別」 */
type ChartTab = "monthly" | "average" | "weekday" | "summary";

const CHART_TABS: { value: ChartTab; label: string }[] = [
  { value: "monthly", label: "月別" },
  { value: "average", label: "1回あたり" },
  { value: "weekday", label: "曜日別" },
  { value: "summary", label: "サマリー" },
];

/**
 * 店舗別の収益ページのグラフ部分。1 枚ずつタブで出す。
 *
 * 組織全体版（収益タブ）は「店舗別 / 月別 / 月次サマリー」の 3 枚だが、店舗が 1 軒に
 * 固定されると店舗別の軸が消える。代わりに**その店舗の中の傾向**を 2 枚足してある。
 *
 * ⚠️ スマホ幅では縦に積むと売上履歴まで遠くなるので、全体版と同じく 1 枚だけ出す。
 */
export function StoreChartTabs({
  storeRevenue,
  revenueLoading,
  points,
  items,
}: {
  storeRevenue: StoreRevenue[];
  revenueLoading: boolean;
  points: MonthlyPoint[];
  /** ⚠️ 全期間ぶん。曜日別は期間を絞るとその期間の偏りで傾向が決まる */
  items: FundListItem[];
}) {
  const [tab, setTab] = useState<ChartTab>("monthly");

  return (
    <>
      <SegmentedTabs options={CHART_TABS} value={tab} onChange={setTab} />

      {tab === "monthly" && (
        <MonthlyRevenueCard stores={storeRevenue} isLoading={revenueLoading} />
      )}

      {tab === "average" && (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={styles.cardTitle}>1回あたりの集金額</Text>
          <Muted style={styles.cardNote}>
            回数で補っているのか、台の稼ぎ自体が伸びているのかを見る
          </Muted>
          <AveragePerCollectChart data={points} />
        </Card>
      )}

      {tab === "weekday" && (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={styles.cardTitle}>曜日別の集金額</Text>
          <Muted style={styles.cardNote}>
            いつ回ると効率が良いか。合計ではなく1回あたりの平均で比べている
          </Muted>
          <WeekdayRevenueChart items={items} />
        </Card>
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
  cardNote: { fontSize: 11, marginBottom: spacing.md },
});
