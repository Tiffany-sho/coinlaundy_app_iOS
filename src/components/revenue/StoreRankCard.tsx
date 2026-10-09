import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ChartPager, PagerArrow } from "@/components/revenue/ChartPager";
import { StoreRankBars } from "@/components/revenue/charts";
import { FilterSheet } from "@/components/revenue/PeriodFilterSheet";
import { usePeriodPager } from "@/components/revenue/usePeriodPager";
import { monthLabel, monthKey, type MonthRange } from "@/components/revenue/monthIndex";
import { Card, MoneyText, Muted } from "@/components/common/ui";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { MonthlyChartPoint, StoreRevenue } from "@/api/types";

/**
 * 店舗別の売上。**期間で絞れる**（2026-08-05）。
 *
 * ⚠️ **もとは `useStoreRevenue()` の全期間の合計をそのまま棒にしていた。**
 *    「先月どの店舗が稼いだか」を見る手段が無く、開店時期の違う店舗を
 *    並べると**古い店舗が常に上に来る**（累計なので当然だが、比べたいのは
 *    たいてい直近）。
 *
 * ⚠️ **専用の API は足していない。** `/funds/chart` の `byStore`（月ごと・
 *    店舗ごとの金額）を期間ぶん足し合わせている。⚠️ **`count` は足さないこと。**
 *    あちらは「組織全体の集金回数」で店舗ごとには分かれていない
 *    （`docs/contracts.md` の「エンドポイントの癖」）。
 *
 * ⚠️ **店名は `stores`（`useStoreRevenue`）から引く。** `byStore` はキーが
 *    店舗 ID しか無い。⚠️ **一覧に無い店舗 ID が混ざり得る**（集金のあと
 *    店舗を消した場合）ので、引けなかったものは落とす。
 */
export function StoreRankCard({
  stores,
  isLoading,
}: {
  /** `useStoreRevenue()` の結果。**全期間の合計**なので金額は使わず、名前と下限にだけ使う */
  stores: StoreRevenue[];
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
  } = usePeriodPager({ stores });

  const [filterOpen, setFilterOpen] = useState(false);
  /** 空配列 = 全店舗（月別売上カードと同じ意味づけ） */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const rows = buildRanking(chart.data, range, stores, selectedIds);
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  const storeLabel = selectedIds.length > 0 ? `・${selectedIds.length}店舗` : "";
  const isFilterActive = selectedIds.length > 0 || !isDefaultRange;
  const busy = isLoading || (chart.isLoading && !chart.data);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={styles.headRow}>
        <Text style={styles.cardTitle}>店舗別の売上</Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setFilterOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="期間・店舗で絞り込む"
          style={({ pressed }) => [styles.filterButton, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="options-outline" size={15} color={color.tealDeeper} />
          <Text style={styles.filterButtonLabel}>絞り込み</Text>
          {isFilterActive && <View style={styles.filterDot} />}
        </Pressable>
      </View>

      {/*
        ⚠️ 払っても送れるが**矢印も必ず出す。** ジェスチャだけにすると
           気づかれないうえ、VoiceOver から操作できない。
      */}
      <View style={styles.periodRow}>
        <PagerArrow direction={-1} disabled={!canPrev} onPress={() => onPage(-1)} />
        <View style={styles.periodBody}>
          <Muted style={styles.totalLabel}>
            集金総額（{monthLabel(range.start)} 〜 {monthLabel(range.end)}
            {storeLabel}）
          </Muted>
          <MoneyText value={total} size={26} tone="deeper" />
        </View>
        <PagerArrow direction={1} disabled={!canNext} onPress={() => onPage(1)} />
      </View>

      {/*
        ⚠️ **支払方法の絞り込みは出さない**（`methodNames` を渡さない）。
           `byStore` と `byMethod` は独立した畳み方で「この店舗の PayPay」は
           データとして存在しないため、両方を同時には絞れない。
      */}
      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        stores={stores}
        range={range}
        selectedIds={selectedIds}
        methodNames={[]}
        methods={[]}
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
        /* ⚠️ **端では隣を描かない。** 存在しない期間の空グラフが覗いて
              「まだ先がある」ように見える */
        <ChartPager
          pageKey={pageKey}
          canPrev={canPrev}
          canNext={canNext}
          onPage={onPage}
          prev={
            canPrev ? (
              <StoreRankBars data={buildRanking(prevChart.data, prevRange, stores, selectedIds)} />
            ) : null
          }
          current={<StoreRankBars data={rows} />}
          next={
            canNext ? (
              <StoreRankBars data={buildRanking(nextChart.data, nextRange, stores, selectedIds)} />
            ) : null
          }
        />
      )}
    </Card>
  );
}

/**
 * 期間ぶんの `byStore` を足して、売上の多い順に並べる。
 *
 * ⚠️ **金額が数値であることまで確かめる。** react-query の永続キャッシュから
 *    この項目を持たない応答が復元され得る（`byStore` ごと `undefined`）。
 * ⚠️ **0 円の店舗は落とす。** 全期間なら「まだ集金していない店舗」を出す意味も
 *    あるが、期間を切ると**その期間に回らなかっただけ**の店舗が長さ 0 の棒で
 *    ずらりと並ぶ。
 */
function buildRanking(
  rows: MonthlyChartPoint[] | undefined,
  range: MonthRange,
  stores: StoreRevenue[],
  selectedIds: string[]
): { laundryId: string; laundryName: string; total: number }[] {
  const byMonth = new Map((rows ?? []).map((point) => [point.month, point]));
  const totals = new Map<string, number>();

  for (let i = range.start; i <= range.end; i += 1) {
    const point = byMonth.get(monthKey(i));
    for (const [laundryId, amount] of Object.entries(point?.byStore ?? {})) {
      if (!Number.isFinite(amount)) continue;
      totals.set(laundryId, (totals.get(laundryId) ?? 0) + amount);
    }
  }

  return stores
    .filter((store) => selectedIds.length === 0 || selectedIds.includes(store.laundryId))
    .map((store) => ({
      laundryId: store.laundryId,
      laundryName: store.laundryName,
      total: totals.get(store.laundryId) ?? 0,
    }))
    .filter((row) => row.total > 0)
    /* ⚠️ 並べ直す。`stores` は**全期間**の多い順なので、期間を切ると順位が変わる */
    .sort((a, b) => b.total - a.total);
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { flex: 1, fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.cyan200,
  },
  filterButtonLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.tealDeeper },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.orange500,
  },

  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  periodBody: { flex: 1, alignItems: "center" },
  totalLabel: { fontSize: 11 },
  fallbackNote: { fontSize: 12, textAlign: "center", paddingVertical: spacing.xl },
});
