import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useMachineBreakdown } from "@/api/queries";
import { ChartPager, PagerArrow } from "@/components/revenue/ChartPager";
import { MachineBreakdownChart } from "@/components/revenue/MachineBreakdownChart";
import { FilterSheet } from "@/components/revenue/PeriodFilterSheet";
import { usePeriodPager } from "@/components/revenue/usePeriodPager";
import { monthLabel, monthStartEpoch } from "@/components/revenue/monthIndex";
import { Card, Muted } from "@/components/common/ui";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { StoreRevenue } from "@/api/types";

/**
 * 「機器別の売上」カード。期間の絞り込みと前後への送りは月別売上と同じ。
 *
 * ⚠️ **店舗別ページ専用。** 組織全体では出さない。店舗をまたぐと同じ名前
 *    （「洗濯機1」）の別の台が合算されて意味の無い数字になる。
 *
 * ⚠️ **`usePeriodPager` は `fetchCharts: false` で使う。** 期間の操作だけ借りていて
 *    月別売上のデータは使わないため。付けないと `useMonthlyChart` が 3 本無駄に走る。
 */
export function MachineBreakdownCard({
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
    isDefaultRange,
  } = usePeriodPager({ stores, storeId, fetchCharts: false });
  const [filterOpen, setFilterOpen] = useState(false);

  // ⚠️ to は排他。終了月を含めたいので翌月 1 日を渡す（/funds/chart と同じ規約）
  const current = useMachineBreakdown(
    storeId,
    monthStartEpoch(range.start),
    monthStartEpoch(range.end + 1)
  );
  /* ⚠️ 前後も先に取っておく。指で引いている最中に隣の期間を覗かせるため */
  const prev = useMachineBreakdown(
    storeId,
    monthStartEpoch(prevRange.start),
    monthStartEpoch(prevRange.end + 1),
    canPrev
  );
  const next = useMachineBreakdown(
    storeId,
    monthStartEpoch(nextRange.start),
    monthStartEpoch(nextRange.end + 1),
    canNext
  );

  const busy = isLoading || (current.isLoading && !current.data);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={styles.headRow}>
        <Text style={styles.cardTitle}>機器別の売上</Text>
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

      <Muted style={styles.cardNote}>どの台が稼いでいるか、入れ替えの判断に使う</Muted>

      {/* ⚠️ 矢印は必ず出す。払う操作だけだと気づかれず、VoiceOver からも操作できない */}
      <View style={styles.periodRow}>
        <PagerArrow direction={-1} disabled={!canPrev} onPress={() => onPage(-1)} />
        <Muted style={styles.periodLabel}>
          {monthLabel(range.start)} 〜 {monthLabel(range.end)}
        </Muted>
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
      ) : current.isError ? (
        <Muted style={styles.fallbackNote}>機器別の売上を取得できませんでした</Muted>
      ) : (
        /* ⚠️ 端では隣を描かない。空のグラフが覗いて「まだ先がある」ように見える */
        <ChartPager
          pageKey={pageKey}
          canPrev={canPrev}
          canNext={canNext}
          onPage={onPage}
          prev={canPrev ? <MachineBreakdownChart data={prev.data} /> : null}
          current={<MachineBreakdownChart data={current.data} />}
          next={canNext ? <MachineBreakdownChart data={next.data} /> : null}
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
  periodLabel: { flex: 1, fontSize: 12, textAlign: "center" },
  fallbackNote: { textAlign: "center", marginVertical: spacing.xl },
});
