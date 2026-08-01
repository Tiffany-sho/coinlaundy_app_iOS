import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ChartPager, PagerArrow } from "@/components/revenue/ChartPager";
import { AveragePerCollectChart } from "@/components/revenue/StoreAnalysisCharts";
import { FilterSheet } from "@/components/revenue/PeriodFilterSheet";
import { buildAveragePoints } from "@/components/revenue/monthlySeries";
import { usePeriodPager } from "@/components/revenue/usePeriodPager";
import { monthLabel } from "@/components/revenue/monthIndex";
import { Card, Muted } from "@/components/common/ui";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { StoreRevenue } from "@/api/types";

/**
 * 「1 回あたりの集金額」カード。期間の絞り込みと前後への送りは月別売上と同じ。
 *
 * 集金の回数を増やせば総額は当然増えるので、総額だけ見ていると
 * 「機械の稼ぎが落ちているのに回数で補っている」状態に気づけない。
 *
 * ⚠️ **`storeId` を必ず渡すこと。** 1 回あたりは `total / count` なので、
 *    店舗で絞らずに取ると `count` が組織全体の集金回数になり、**実際より小さく出る。**
 * ⚠️ 期間の仕組み（送り幅・下限・先読み）は `usePeriodPager` が正。
 *    月別売上と食い違わせないこと。
 */
export function AveragePerCollectCard({
  stores,
  storeId,
  isLoading,
}: {
  stores: StoreRevenue[];
  storeId: string;
  isLoading: boolean;
}) {
  const {
    range,
    setRange,
    prevRange,
    nextRange,
    canPrev,
    canNext,
    onPage,
    pageKey,
    chart,
    prevChart,
    nextChart,
    isDefaultRange,
  } = usePeriodPager({ stores, storeId });
  const [filterOpen, setFilterOpen] = useState(false);

  const points = buildAveragePoints(chart.data, range);
  const collected = points.filter((p) => p.count > 0);
  /** 期間全体をならした 1 回あたり。⚠️ 月ごとの平均をさらに平均しない（月の重みが消える） */
  const totalCount = collected.reduce((sum, p) => sum + p.count, 0);
  const totalFunds = collected.reduce((sum, p) => sum + p.total, 0);
  const overall = totalCount > 0 ? Math.round(totalFunds / totalCount) : 0;

  const busy = isLoading || (chart.isLoading && !chart.data);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={styles.headRow}>
        <Text style={styles.cardTitle}>1回あたりの集金額</Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setFilterOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="期間で絞り込む"
          style={({ pressed }) => [styles.filterButton, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="options-outline" size={15} color={color.tealDeeper} />
          <Text style={styles.filterButtonLabel}>絞り込み</Text>
          {!isDefaultRange && <View style={styles.filterDot} />}
        </Pressable>
      </View>

      <Muted style={styles.cardNote}>
        回数で補っているのか、台の稼ぎ自体が伸びているのかを見る
      </Muted>

      {/* ⚠️ 矢印は必ず出す。払う操作だけだと気づかれず、VoiceOver からも操作できない */}
      <View style={styles.periodRow}>
        <PagerArrow direction={-1} disabled={!canPrev} onPress={() => onPage(-1)} />
        <View style={styles.periodBody}>
          <Muted style={styles.periodLabel}>
            期間平均（{monthLabel(range.start)} 〜 {monthLabel(range.end)}）
          </Muted>
          <Text style={styles.periodValue}>
            {totalCount > 0 ? `¥${overall.toLocaleString()}` : "—"}
          </Text>
        </View>
        <PagerArrow direction={1} disabled={!canNext} onPress={() => onPage(1)} />
      </View>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        stores={stores}
        range={range}
        selectedIds={[]}
        onApply={(nextRange) => {
          setRange(nextRange);
          setFilterOpen(false);
        }}
      />

      {busy ? (
        <ActivityIndicator color={color.teal} style={{ marginVertical: spacing.xl }} />
      ) : chart.isError ? (
        <Muted style={styles.fallbackNote}>売上を取得できませんでした</Muted>
      ) : (
        /* ⚠️ 端では隣を描かない。空のグラフが覗いて「まだ先がある」ように見える */
        <ChartPager
          pageKey={pageKey}
          canPrev={canPrev}
          canNext={canNext}
          onPage={onPage}
          prev={
            canPrev ? <AveragePerCollectChart points={buildAveragePoints(prevChart.data, prevRange)} /> : null
          }
          current={<AveragePerCollectChart points={points} />}
          next={
            canNext ? <AveragePerCollectChart points={buildAveragePoints(nextChart.data, nextRange)} /> : null
          }
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  cardTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
  cardNote: { fontSize: 11, marginBottom: spacing.sm },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.cyan100,
    backgroundColor: color.cyan50,
  },
  filterButtonLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.tealDeeper },
  filterDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: color.teal },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodBody: { flex: 1 },
  periodLabel: { fontSize: 11 },
  periodValue: { fontFamily: font.uiBold, fontSize: 22, color: color.tealDeeper, marginTop: 2 },
  fallbackNote: { textAlign: "center", marginVertical: spacing.xl },
});
