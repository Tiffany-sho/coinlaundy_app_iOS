import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Chip } from "@/components/common/Chip";
import { MonthField } from "@/components/revenue/MonthPicker";
import {
  currentMonthIndex,
  type MonthIndex,
  type MonthRange as Range,
} from "@/components/revenue/monthIndex";
import { color, font, radius, spacing, STORE_COLORS } from "@/theme/tokens";
import type { StoreRevenue } from "@/api/types";

/** 遡れる上限。Web の SegmentedPeriod.jsx の MAX_MONTHS と同じ 60 か月（5 年） */
const MAX_MONTHS_BACK = 60;

/** すぐ押せる定型。Web のスライダーを一発で動かす代わり */
const PRESETS = [
  { months: 6, label: "6か月" },
  { months: 12, label: "12か月" },
  { months: 24, label: "2年" },
  { months: 60, label: "5年" },
] as const;

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
 *
 * ⚠️ 月の選び方は**集金画面の集金日と同じ**（たたんだ行 → タップで開くパネル）。
 *    以前は 2 つのマス目を出しっぱなしにしていたので、シートが縦に長く
 *    中でスクロールしないと適用ボタンに届かなかった。
 *    ⚠️ **開くのはどちらか一方だけ。** 両方開くと同じ高さの問題に戻る。
 */
export function FilterSheet({
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
  /** 開いている月のパネル。⚠️ 同時に 1 つだけ（両方開くとシートが画面より高くなる） */
  const [expanded, setExpanded] = useState<"start" | "end" | null>(null);

  // 開いた瞬間に適用中の値を写す。閉じている間に外で変わっても追従する
  useEffect(() => {
    if (!open) return;
    setDraftRange(range);
    setDraftIds(selectedIds.length > 0 ? [...selectedIds] : stores.map((s) => s.laundryId));
    // ⚠️ たたんだ状態から始める。前回開いたパネルが残ると開いた瞬間に縦長になる
    setExpanded(null);
  }, [open, range, selectedIds, stores]);

  const allSelected = draftIds.length === stores.length;

  /** ⚠️ 選んだら閉じる。集金画面の集金日と同じ挙動（開いたままにしない） */
  function setStart(index: MonthIndex) {
    Haptics.selectionAsync().catch(() => {});
    // 開始が終了を追い越したら終了も一緒に動かす（範囲が反転しないように）
    setDraftRange((prev) => ({ start: index, end: Math.max(prev.end, index) }));
    setExpanded(null);
  }

  function setEnd(index: MonthIndex) {
    Haptics.selectionAsync().catch(() => {});
    setDraftRange((prev) => ({ start: Math.min(prev.start, index), end: index }));
    setExpanded(null);
  }

  /** 表示店舗の切り替え。最後の 1 店舗は外させない（Web の toggleStore と同じ） */
  function toggleStore(id: string) {
    // ⚠️ 触覚は Chip 側で鳴らす。ここでも呼ぶと 2 回鳴って引っかかったように感じる
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
                        setDraftRange({ start, end: current });
                        // プリセットは範囲ごと決まるので、開いていたパネルは閉じる
                        setExpanded(null);
                      }}
                    />
                  );
                })}
              </View>

              {/*
                ⚠️ 開くのはどちらか一方だけ。onToggle で相手を閉じている。
                   月のマス目は縦 3 行あるので、両方開くとシートが画面より高くなる
              */}
              <MonthField
                label="開始月"
                value={draftRange.start}
                min={oldest}
                max={current}
                open={expanded === "start"}
                onToggle={() => setExpanded((prev) => (prev === "start" ? null : "start"))}
                onChange={setStart}
              />

              {/* 終了月は開始月より前を選べないようにする（範囲が反転しない） */}
              <MonthField
                label="終了月"
                value={draftRange.end}
                min={draftRange.start}
                max={current}
                open={expanded === "end"}
                onToggle={() => setExpanded((prev) => (prev === "end" ? null : "end"))}
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

/** 見出し。もとは MonthlyRevenueCard の styles にあったもの */
const styles = StyleSheet.create({
  filterLabel: {
    fontFamily: font.uiBold,
    fontSize: 11,
    color: color.textMuted,
    marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
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
