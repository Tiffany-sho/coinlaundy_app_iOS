import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useMonthlyChart } from "@/api/queries";
import {
  MonthlyStackedBarChart,
  type StackedPoint,
  type StackSeries,
} from "@/components/revenue/charts";
import { FilterSheet } from "@/components/revenue/PeriodFilterSheet";
import {
  currentMonthIndex,
  monthKey,
  monthLabel,
  monthStartEpoch,
  type MonthRange as Range,
} from "@/components/revenue/monthIndex";
import { Card, MoneyText, Muted } from "@/components/common/ui";
import { color, font, radius, spacing, STORE_COLORS } from "@/theme/tokens";
import type { StoreRevenue } from "@/api/types";

/**
 * 月別売上カード。期間と店舗で絞り込み、棒は店舗ごとに積み上げる。
 *
 * Web の対応箇所：
 *   - 絞り込み          … parts/SegmentedPeriod.jsx の PeriodFilterButton（期間 + 表示店舗）
 *   - 店舗ごとの積み上げ … Chart/ManyCoinDataChart.jsx の <Bar stackId="stack"> ×店舗数
 *
 * データは /funds/chart?groupBy=month（useMonthlyChart）を使う。
 * ⚠️ /funds/summary/monthly は前年同月比のため**過去 2 年に固定**されているので、
 *    任意期間を選ばせるこのカードでは使えない。
 *    chart 側は店舗ごとの内訳（byStore）も一緒に返すので、積み上げのために
 *    店舗数ぶんリクエストを投げる必要もない。
 */

/** 既定は直近 12 か月 */
const DEFAULT_MONTHS = 12;

export function MonthlyRevenueCard({
  stores,
  isLoading,
}: {
  /** useStoreRevenue() の結果。色の割り当ても店舗別グラフと同じこの並び順に合わせる */
  stores: StoreRevenue[];
  isLoading: boolean;
}) {
  const current = currentMonthIndex();
  const [range, setRange] = useState<Range>({
    start: current - (DEFAULT_MONTHS - 1),
    end: current,
  });
  /** 空配列 = 全店舗（Web の selectedStores と同じ意味づけ） */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  // ⚠️ to は排他。終了月を含めたいので翌月 1 日を渡す
  const chart = useMonthlyChart(monthStartEpoch(range.start), monthStartEpoch(range.end + 1));

  /** 月キー → その月の実績。取得できなかった月は 0 で埋める */
  const byMonth = new Map((chart.data ?? []).map((point) => [point.month, point]));

  const visible = stores
    // 色は stores の並び（＝売上の多い順）で決める。店舗別タブのグラフと同じ色になる
    .map((store, i) => ({ store, color: STORE_COLORS[i % STORE_COLORS.length] }))
    .filter(({ store }) => selectedIds.length === 0 || selectedIds.includes(store.laundryId));

  const series: StackSeries[] = visible.map(({ store, color: dot }) => ({
    key: store.laundryId,
    name: store.laundryName,
    color: dot,
  }));

  // 選んだ期間ぶんの月を必ず並べる。データのある月だけ並べると歯抜けになる
  const stacked: StackedPoint[] = [];
  for (let i = range.start; i <= range.end; i += 1) {
    const key = monthKey(i);
    const point = byMonth.get(key);
    const parts: Record<string, number> = {};
    let total = 0;

    for (const { store } of visible) {
      const amount = point?.byStore?.[store.laundryId] ?? 0;
      if (amount === 0) continue;
      parts[store.laundryId] = amount;
      total += amount;
    }

    // 回数は店舗を絞ると内訳から出せない（byStore は金額しか持たない）。
    // 全店舗のときだけ実数を出し、絞り込み中は 0 にして「—」扱いにする
    const count = selectedIds.length === 0 ? (point?.count ?? 0) : 0;
    stacked.push({ month: key, total, count, parts });
  }

  const total = stacked.reduce((sum, point) => sum + point.total, 0);

  const storeLabel = selectedIds.length > 0 ? `・${selectedIds.length}店舗` : "";
  // 既定（直近12か月・全店舗）から外れているときだけボタンに点を出す
  const isFilterActive =
    selectedIds.length > 0 ||
    range.end !== current ||
    range.start !== current - (DEFAULT_MONTHS - 1);

  const busy = isLoading || (chart.isLoading && !chart.data);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      {/* 見出しの右に絞り込みボタン。Web の PeriodFilterButton と同じ置き方 */}
      <View style={styles.headRow}>
        <Text style={styles.cardTitle}>月別売上</Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setFilterOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="期間と店舗で絞り込む"
          style={({ pressed }) => [styles.filterButton, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="options-outline" size={15} color={color.tealDeeper} />
          <Text style={styles.filterButtonLabel}>絞り込み</Text>
          {/* Web と同じで、既定から外れているときだけ点を出す */}
          {isFilterActive && <View style={styles.filterDot} />}
        </Pressable>
      </View>

      {/* ラベルと金額は隣り合わせにする。離すとどの数字の説明か分からなくなる */}
      <Muted style={styles.totalLabel}>
        集金総額（{monthLabel(range.start)} 〜 {monthLabel(range.end)}
        {storeLabel}）
      </Muted>
      <View style={{ marginTop: 2, marginBottom: spacing.md }}>
        <MoneyText value={total} size={26} tone="deeper" />
      </View>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        stores={stores}
        range={range}
        selectedIds={selectedIds}
        onApply={(nextRange, nextIds) => {
          setRange(nextRange);
          setSelectedIds(nextIds);
          setFilterOpen(false);
        }}
      />

      {busy ? (
        <ActivityIndicator color={color.teal} style={{ marginVertical: spacing.xl }} />
      ) : chart.isError ? (
        <Muted style={styles.fallbackNote}>売上を取得できませんでした</Muted>
      ) : (
        /* ⚠️ 店舗が 1 軒だけのときは内訳を出さない（店舗別の収益ページがこれ）。
              棒の合計と内訳の金額が同じになり、同じ数字が縦に 2 回並ぶだけになる */
        <MonthlyStackedBarChart
          data={stacked}
          series={series}
          showBreakdown={stores.length > 1}
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
    marginBottom: spacing.md,
  },
  cardTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.cyan100,
    backgroundColor: color.appBg,
  },
  filterButtonLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.tealDeeper },
  /** 既定から外れているときの目印。Web の cyan.500 の丸と同じ */
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.teal,
    marginLeft: 1,
  },
  totalLabel: { fontSize: 12 },
  fallbackNote: { fontSize: 11, marginVertical: spacing.xl, textAlign: "center" },
});
