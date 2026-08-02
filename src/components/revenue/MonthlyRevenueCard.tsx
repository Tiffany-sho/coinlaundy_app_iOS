import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { MonthlyStackedBarChart, type StackSeries } from "@/components/revenue/charts";
import { ChartPager, PagerArrow } from "@/components/revenue/ChartPager";
import { buildMethodPoints, buildStackedPoints } from "@/components/revenue/monthlySeries";
import { paymentMethodNames, useStores } from "@/api/queries";
import { usePeriodPager } from "@/components/revenue/usePeriodPager";
import { FilterSheet } from "@/components/revenue/PeriodFilterSheet";
import { methodLabel, methodsLabel } from "@/components/revenue/methodFilter";
import { monthLabel } from "@/components/revenue/monthIndex";
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

export function MonthlyRevenueCard({
  stores,
  isLoading,
  storeId,
}: {
  /** useStoreRevenue() の結果。色の割り当ても店舗別グラフと同じこの並び順に合わせる */
  stores: StoreRevenue[];
  isLoading: boolean;
  /**
   * 1 店舗だけを見るときの店舗 ID（店舗別の収益ページ）。
   * ⚠️ **渡さないと「◯回」が組織全体の集金回数になる。** 金額は byStore から
   *    取り出せるが、回数は店舗ごとに分かれていないため。
   */
  storeId?: string;
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
  /** 空配列 = 全店舗（Web の selectedStores と同じ意味づけ） */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  /** 支払方法の絞り込み。⚠️ **空配列 = 絞らない**（複数選べる） */
  const [methods, setMethods] = useState<string[]>([]);

  /*
    ⚠️ **支払方法は店舗ごと**（009）なので、店舗一覧から名前を集めて畳む。
       ⚠️ ここで使う `stores` は収益サマリ（StoreRevenue）で支払方法を持たない。
       別物なので取り違えないこと。
  */
  const storeList = useStores();
  const methodNames = paymentMethodNames(storeList.data);
  const byMethodActive = methods.length > 0;

  const visible = stores
    // 色は stores の並び（＝売上の多い順）で決める。店舗別タブのグラフと同じ色になる
    .map((store, i) => ({ store, color: STORE_COLORS[i % STORE_COLORS.length] }))
    .filter(({ store }) => selectedIds.length === 0 || selectedIds.includes(store.laundryId));

  /*
    ⚠️ **支払方法で絞ると店舗別の内訳は出せない。** 応答の byStore（金額）と
       byMethod はそれぞれ独立した畳み方で、「この店舗の PayPay」は
       データとして存在しない。方法を選んだら**方法ごとの積み上げ**に切り替える。
  */
  const series: StackSeries[] = byMethodActive
    ? methods.map((key, i) => ({
        key,
        name: methodLabel(key),
        color: STORE_COLORS[i % STORE_COLORS.length],
      }))
    : visible.map(({ store, color: dot }) => ({
        key: store.laundryId,
        name: store.laundryName,
        color: dot,
      }));

  /*
    ⚠️ **方法で絞るときは回数を出さない。** count は「その月の集金回数」で
       支払方法ごとには分かれていない。出すと「PayPay で 8 回」と読めてしまう。
  */
  const withCount = selectedIds.length === 0 && !byMethodActive;

  /*
    棒の下に内訳を出すか。
    ⚠️ **1 系列しか無いときは出さない。** 棒の合計と内訳の金額が同じになり、
       同じ数字が縦に 2 回並ぶだけになる（店舗が 1 軒の収益ページがこれ）。
       支払方法で絞ったときも同じで、1 つだけ選んだ場合は出さない。
  */
  const showBreakdown = byMethodActive ? methods.length > 1 : stores.length > 1;

  const buildPoints = (rows: typeof chart.data, r: typeof range) =>
    byMethodActive
      ? buildMethodPoints(rows, r, methods)
      : buildStackedPoints(rows, r, visible, withCount);

  const stacked = buildPoints(chart.data, range);
  const total = stacked.reduce((sum, point) => sum + point.total, 0);

  const storeLabel = selectedIds.length > 0 ? `・${selectedIds.length}店舗` : "";
  // 既定（直近12か月・全店舗）から外れているときだけボタンに点を出す
  const isFilterActive = selectedIds.length > 0 || !isDefaultRange || byMethodActive;

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
          accessibilityLabel="期間・店舗・支払方法で絞り込む"
          style={({ pressed }) => [styles.filterButton, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="options-outline" size={15} color={color.tealDeeper} />
          <Text style={styles.filterButtonLabel}>絞り込み</Text>
          {/* Web と同じで、既定から外れているときだけ点を出す */}
          {isFilterActive && <View style={styles.filterDot} />}
        </Pressable>
      </View>

      {/*
        期間の送り。グラフを横に払っても送れるが、**矢印も必ず出す。**
        ⚠️ ジェスチャだけにすると気づかれないうえ、**VoiceOver から操作できない。**
      */}
      <View style={styles.periodRow}>
        <PagerArrow direction={-1} disabled={!canPrev} onPress={() => onPage(-1)} />
        {/* ラベルと金額は隣り合わせにする。離すとどの数字の説明か分からなくなる */}
        <View style={styles.periodBody}>
          <Muted style={styles.totalLabel}>
            集金総額（{monthLabel(range.start)} 〜 {monthLabel(range.end)}
            {storeLabel}）{byMethodActive ? ` ・${methodsLabel(methods)}` : ""}
          </Muted>
          <MoneyText value={total} size={26} tone="deeper" />
        </View>
        <PagerArrow direction={1} disabled={!canNext} onPress={() => onPage(1)} />
      </View>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        stores={stores}
        range={range}
        selectedIds={selectedIds}
        methodNames={methodNames}
        methods={methods}
        onApply={(nextRange, nextIds, nextMethods) => {
          setRange(nextRange);
          setSelectedIds(nextIds);
          setMethods(nextMethods);
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
        /*
          ⚠️ 3 面まとめて描く。指で引いている最中に隣の期間が見えるようにするため。
             ⚠️ **端では隣を描かない**（`canPrev` / `canNext`）。描くと存在しない期間の
                空グラフが覗いて「まだ先がある」ように見える。
        */
        <ChartPager
          pageKey={pageKey}
          canPrev={canPrev}
          canNext={canNext}
          onPage={onPage}
          prev={
            canPrev ? (
              <MonthlyStackedBarChart
                data={buildPoints(prevChart.data, prevRange)}
                series={series}
                showBreakdown={showBreakdown}
              />
            ) : null
          }
          current={
            <MonthlyStackedBarChart
              data={stacked}
              series={series}
              showBreakdown={showBreakdown}
            />
          }
          next={
            canNext ? (
              <MonthlyStackedBarChart
                data={buildPoints(nextChart.data, nextRange)}
                series={series}
                showBreakdown={showBreakdown}
              />
            ) : null
          }
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodBody: { flex: 1 },
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
