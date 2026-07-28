import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useMonthlyChart } from "@/api/queries";
import { MonthlyStackedBarChart, type StackedPoint, type StackSeries } from "./charts";
import { MonthRangePicker } from "./revenue/MonthRangePicker";
import {
  currentMonthIndex,
  monthKey,
  monthLabel,
  monthStartEpoch,
  type MonthIndex,
  type MonthRange as Range,
} from "./revenue/monthIndex";
import { Card, MoneyText, Muted } from "./ui";
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

/** 遡れる上限。Web の SegmentedPeriod.jsx の MAX_MONTHS と同じ 60 か月（5 年） */
const MAX_MONTHS_BACK = 60;

/** 既定は直近 12 か月 */
const DEFAULT_MONTHS = 12;

/** すぐ押せる定型。Web のスライダーを一発で動かす代わり */
const PRESETS = [
  { months: 6, label: "6か月" },
  { months: 12, label: "12か月" },
  { months: 24, label: "2年" },
  { months: 60, label: "5年" },
] as const;

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
        <MonthlyStackedBarChart data={stacked} series={series} />
      )}
    </Card>
  );
}

/**
 * 絞り込みシート。Web の PeriodFilterButton（parts/SegmentedPeriod.jsx）の移植。
 *
 * Web と同じ「開いた時点の適用値をドラフトに写す → 触っても即反映しない →
 * 適用で確定、キャンセルで破棄」という作りにしてある。グラフが指の下で
 * ちらちら変わらないので、条件を組み立ててから見比べられる。
 *
 * ⚠️ 期間は Web の 2 つまみレンジスライダーではなく、開始月・終了月を直接選ぶ形にした。
 *    RN に 2 つまみのスライダーが標準に無く、追加パッケージを入れると Metro の
 *    再起動が要るため。選べる範囲と結果は Web と同じ（最大 5 年前まで）。
 */
function FilterSheet({
  open,
  onClose,
  stores,
  range,
  selectedIds,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  stores: StoreRevenue[];
  range: Range;
  selectedIds: string[];
  onApply: (range: Range, selectedIds: string[]) => void;
}) {
  const current = currentMonthIndex();
  const oldest = current - (MAX_MONTHS_BACK - 1);

  const [draftRange, setDraftRange] = useState<Range>(range);
  /** ドラフトでは「全店舗」も全 id を並べた状態で持つ（Web の draftStores と同じ） */
  const [draftIds, setDraftIds] = useState<string[]>([]);

  // 開いた瞬間に適用中の値を写す。閉じている間に外で変わっても追従する
  useEffect(() => {
    if (!open) return;
    setDraftRange(range);
    setDraftIds(selectedIds.length > 0 ? [...selectedIds] : stores.map((s) => s.laundryId));
  }, [open, range, selectedIds, stores]);

  const allSelected = draftIds.length === stores.length;

  function setStart(index: MonthIndex) {
    Haptics.selectionAsync().catch(() => {});
    // 開始が終了を追い越したら終了も一緒に動かす（範囲が反転しないように）
    setDraftRange((prev) => ({ start: index, end: Math.max(prev.end, index) }));
  }

  function setEnd(index: MonthIndex) {
    Haptics.selectionAsync().catch(() => {});
    setDraftRange((prev) => ({ start: Math.min(prev.start, index), end: index }));
  }

  /** 表示店舗の切り替え。最後の 1 店舗は外させない（Web の toggleStore と同じ） */
  function toggleStore(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setDraftIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={() => {}}>
          <View style={sheetStyles.header}>
            <Ionicons name="options-outline" size={18} color={color.tealDeeper} />
            <Text style={sheetStyles.headerTitle}>絞り込み</Text>
          </View>

          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            <View style={sheetStyles.body}>
              <Text style={styles.filterLabel}>期間</Text>

              {/* 選択中の範囲。Web の「開始日 〜 終了日」表示と同じ役割 */}
              <View style={sheetStyles.rangeRow}>
                <View>
                  <Text style={sheetStyles.rangeCaption}>開始月</Text>
                  <Text style={sheetStyles.rangeValue}>{monthLabel(draftRange.start)}</Text>
                </View>
                <Text style={sheetStyles.rangeTilde}>〜</Text>
                <View>
                  <Text style={sheetStyles.rangeCaption}>終了月</Text>
                  <Text style={sheetStyles.rangeValue}>{monthLabel(draftRange.end)}</Text>
                </View>
              </View>

              <View style={styles.chipRow}>
                {PRESETS.map((preset) => {
                  const start = current - (preset.months - 1);
                  const selected = draftRange.start === start && draftRange.end === current;
                  return (
                    <Chip
                      key={preset.months}
                      label={preset.label}
                      selected={selected}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setDraftRange({ start, end: current });
                      }}
                    />
                  );
                })}
              </View>

              <Text style={sheetStyles.pickerLabel}>開始月</Text>
              <MonthRangePicker
                value={draftRange.start}
                min={oldest}
                max={current}
                onChange={setStart}
              />

              <Text style={sheetStyles.pickerLabel}>終了月</Text>
              {/* 終了月は開始月より前を選べないようにする（範囲が反転しない） */}
              <MonthRangePicker
                value={draftRange.end}
                min={draftRange.start}
                max={current}
                onChange={setEnd}
              />

              {stores.length > 1 && (
                <>
                  <View style={sheetStyles.divider} />
                  <View style={sheetStyles.storeHead}>
                    <Text style={styles.filterLabel}>表示店舗</Text>
                    {!allSelected && (
                      <Pressable
                        onPress={() => setDraftIds(stores.map((s) => s.laundryId))}
                        hitSlop={8}
                      >
                        <Text style={sheetStyles.selectAll}>全て選択</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.chipRow}>
                    {stores.map((store, i) => (
                      <Chip
                        key={store.laundryId}
                        label={store.laundryName}
                        selected={draftIds.includes(store.laundryId)}
                        dotColor={STORE_COLORS[i % STORE_COLORS.length]}
                        onPress={() => toggleStore(store.laundryId)}
                      />
                    ))}
                  </View>
                </>
              )}
            </View>
          </ScrollView>

          <View style={sheetStyles.footer}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [sheetStyles.footerButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={sheetStyles.cancelLabel}>キャンセル</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                // 全部選んである状態は「絞り込みなし」（＝空配列）として持つ
                onApply(draftRange, allSelected ? [] : draftIds)
              }
              style={({ pressed }) => [
                sheetStyles.footerButton,
                sheetStyles.applyButton,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={sheetStyles.applyLabel}>適用</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 選択チップ。Web の PeriodFilterButton 内にある丸い店舗チップと同じ見た目 */
function Chip({
  label,
  selected,
  dotColor,
  onPress,
}: {
  label: string;
  selected: boolean;
  dotColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && { opacity: 0.75 },
      ]}
    >
      {dotColor && <View style={[styles.chipDot, { backgroundColor: dotColor }]} />}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
  filterLabel: {
    fontFamily: font.uiBold,
    fontSize: 11,
    color: color.textMuted,
    marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 32,
    maxWidth: 140,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.divider,
    backgroundColor: color.cardBg,
  },
  chipSelected: { borderColor: color.cyan400, backgroundColor: color.cyan50 },
  chipDot: { width: 8, height: 8, borderRadius: 2 },
  chipLabel: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, flexShrink: 1 },
  chipLabelSelected: { fontFamily: font.uiBold, color: color.cyan700 },
  fallbackNote: { fontSize: 11, marginVertical: spacing.xl, textAlign: "center" },
});

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: color.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.tealPale,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
  body: { padding: spacing.lg },
  rangeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  rangeCaption: { fontFamily: font.ui, fontSize: 10, color: color.textMuted },
  rangeValue: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  rangeTilde: { fontFamily: font.ui, fontSize: 13, color: color.textMuted, paddingBottom: 2 },
  pickerLabel: {
    fontFamily: font.uiBold,
    fontSize: 11,
    color: color.textMuted,
    marginBottom: spacing.sm,
  },
  divider: { height: 1, backgroundColor: color.divider, marginVertical: spacing.lg },
  storeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectAll: { fontFamily: font.uiBold, fontSize: 12, color: color.teal },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  footerButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
  },
  applyButton: { backgroundColor: color.teal },
  cancelLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMuted },
  applyLabel: { fontFamily: font.uiBold, fontSize: 14, color: "#FFFFFF" },
});
