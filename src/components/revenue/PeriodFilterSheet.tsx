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
import { CASH_METHOD_KEY, methodKeyOf } from "@/api/types";
import { color, font, radius, spacing, STORE_COLORS } from "@/theme/tokens";
import type { StoreRevenue } from "@/api/types";

/**
 * 支払方法を絞らないことを表す値。
 * ⚠️ 空文字にしない（`||` で誤って falsy 扱いされる）。
 */
export const ALL_METHODS = "__all__";

/**
 * 直接選べる範囲の下限（今月から何か月前まで）。
 * ⚠️ これより古い期間は**グラフを横に払って**遡る（`ChartPager`）。ここを延ばすのは
 *    「一発で飛べる範囲」を広げるだけで、遡れる限界とは別。
 */
const MAX_MONTHS_BACK = 120;

/**
 * 一度に表示できる長さの上限。**5 年**。
 *
 * ⚠️ これを超えると棒が細くなりすぎて読めない（10 年 = 120 本だと隙間だけで
 *    357px 必要で、使える幅 295px に収まらない）。長い期間はページを送って見る。
 * ⚠️ **BFF 側に期間の上限は無い。** ここを緩めれば長い期間も取れてしまうので、
 *    緩めるなら `charts.tsx` の `barGap` / `monthLabelStep` も一緒に見直すこと。
 */
const MAX_WINDOW_MONTHS = 60;

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
 *    再起動が要るため。
 *
 * ⚠️ **一度に選べるのは 5 年まで**（`MAX_WINDOW_MONTHS`）。それより過去は
 *    グラフを横に払って遡る。開始・終了のどちらを動かしても、5 年を超えたら
 *    もう一方を引き寄せて幅を保つ。
 *
 * ⚠️ 月の選び方は**集金画面の集金日と同じ**（たたんだ行 → タップで開くパネル）。
 *    以前は 2 つのマス目を出しっぱなしにしていたので、シートが縦に長く
 *    中でスクロールしないと適用ボタンに届かなかった。
 *    ⚠️ **開くのはどちらか一方だけ。** 両方開くと同じ高さの問題に戻る。
 *
 * ⚠️ **支払方法もここに入っている**（2026-08-02 にカードの上の横並びチップから移した）。
 *    ⚠️ **カードの上に戻さない。** 絞り込みの入口が 2 か所に分かれ、
 *    「絞り込み」ボタンの点（`isFilterActive`）と実際の条件が食い違って見える。
 */
export function FilterSheet({
  open,
  onClose,
  stores,
  range,
  selectedIds,
  methodNames = [],
  method = ALL_METHODS,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  stores: StoreRevenue[];
  range: Range;
  selectedIds: string[];
  /**
   * 支払方法の名前（現金は含めない。ここで先頭に足す）。
   * ⚠️ **空なら節ごと出さない。** 現金しか扱わない組織でシートが 1 段長くなるだけ。
   * ⚠️ 渡さない画面（機器別の内訳）では支払方法の絞り込み自体が出ない。
   */
  methodNames?: string[];
  method?: string;
  onApply: (range: Range, selectedIds: string[], method: string) => void;
}) {
  const current = currentMonthIndex();
  const oldest = current - (MAX_MONTHS_BACK - 1);

  const [draftRange, setDraftRange] = useState<Range>(range);
  /** ドラフトでは「全店舗」も全 id を並べた状態で持つ（Web の draftStores と同じ） */
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [draftMethod, setDraftMethod] = useState<string>(ALL_METHODS);
  /** 開いている月のパネル。⚠️ 同時に 1 つだけ（両方開くとシートが画面より高くなる） */
  const [expanded, setExpanded] = useState<"start" | "end" | null>(null);

  // 開いた瞬間に適用中の値を写す。閉じている間に外で変わっても追従する
  useEffect(() => {
    if (!open) return;
    setDraftRange(range);
    setDraftIds(selectedIds.length > 0 ? [...selectedIds] : stores.map((s) => s.laundryId));
    setDraftMethod(method);
    // ⚠️ たたんだ状態から始める。前回開いたパネルが残ると開いた瞬間に縦長になる
    setExpanded(null);
  }, [open, range, selectedIds, stores, method]);

  const allSelected = draftIds.length === stores.length;
  /*
    ⚠️ **支払方法を選ぶと店舗では絞れない。** 応答の `byStore` と `byMethod` は
       独立した畳み方で、「この店舗の PayPay」は**データとして存在しない。**
       黙って無視すると「絞ったのに数字が変わらない」ので、
       **店舗の選択を触れなくして理由を出す。**
  */
  const methodActive = draftMethod !== ALL_METHODS;

  /** ⚠️ 選んだら閉じる。集金画面の集金日と同じ挙動（開いたままにしない） */
  function setStart(index: MonthIndex) {
    Haptics.selectionAsync().catch(() => {});
    setDraftRange((prev) => {
      // 開始が終了を追い越したら終了も一緒に動かす（範囲が反転しないように）
      const end = Math.max(prev.end, index);
      // ⚠️ 5 年を超えたら終了を引き寄せる。上限を無視すると棒が潰れる
      return { start: index, end: Math.min(end, index + MAX_WINDOW_MONTHS - 1) };
    });
    setExpanded(null);
  }

  function setEnd(index: MonthIndex) {
    Haptics.selectionAsync().catch(() => {});
    setDraftRange((prev) => {
      const start = Math.min(prev.start, index);
      return { start: Math.max(start, index - MAX_WINDOW_MONTHS + 1), end: index };
    });
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
      {/*
        ⚠️ **背景と本体は兄弟にする。入れ子にしない。**
           入れ子にすると指を降ろした時点で外側の Pressable が responder を取り、
           **1 回目のスクロールが空振りして 2 回目でやっと動く。**
           StateEditSheet / MachineListSheet と同じ形に揃えてある。
      */}
      <View style={sheetStyles.root}>
        <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel="閉じる" />
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.header}>
            <Ionicons name="options-outline" size={18} color={color.tealDeeper} />
            <Text style={sheetStyles.headerTitle}>絞り込み</Text>
          </View>

          {/* ⚠️ 高さの上限は sheet 側に持たせる。ScrollView に maxHeight を付けると
                 高さが中身から決まり、モーダルのスライド中の 1 回目のレイアウトでは
                 「中身 = 枠」＝スクロール不要の状態になり、**1 回目の指が空振りする。**
                 詳細は ExportSheet の同じ箇所のコメント */}
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
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

              {/* ⚠️ 支払方法が 1 件も無いときは節ごと出さない */}
              {methodNames.length > 0 && (
                <>
                  <View style={sheetStyles.divider} />
                  <Text style={styles.filterLabel}>支払方法</Text>
                  <View style={styles.chipRow}>
                    {[
                      { key: ALL_METHODS, label: "すべて" },
                      { key: CASH_METHOD_KEY, label: "現金" },
                      ...methodNames.map((name) => ({ key: methodKeyOf(name), label: name })),
                    ].map((option) => (
                      <Chip
                        key={option.key}
                        label={option.label}
                        selected={option.key === draftMethod}
                        onPress={() => {
                          setDraftMethod(option.key);
                          // 方法で絞る間は店舗の内訳が出せないので、選択をすべてに戻す
                          if (option.key !== ALL_METHODS) {
                            setDraftIds(stores.map((s) => s.laundryId));
                          }
                        }}
                      />
                    ))}
                  </View>
                </>
              )}

              {stores.length > 1 && (
                <>
                  <View style={sheetStyles.divider} />
                  <View style={sheetStyles.storeHead}>
                    <Text style={styles.filterLabel}>表示店舗</Text>
                    {!allSelected && !methodActive && (
                      <Pressable
                        onPress={() => setDraftIds(stores.map((s) => s.laundryId))}
                        hitSlop={8}
                      >
                        <Text style={sheetStyles.selectAll}>全て選択</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* ⚠️ 押せなくするだけでなく理由を出す。黙って無効化すると故障に見える */}
                  {methodActive && (
                    <Text style={sheetStyles.storeNote}>
                      支払方法で絞っている間は店舗を選べません（支払方法ごとの店舗別内訳は
                      記録されていないため）
                    </Text>
                  )}

                  <View style={[styles.chipRow, methodActive && { opacity: 0.4 }]}>
                    {stores.map((store, i) => (
                      <Chip
                        key={store.laundryId}
                        label={store.laundryName}
                        selected={!methodActive && draftIds.includes(store.laundryId)}
                        dotColor={STORE_COLORS[i % STORE_COLORS.length]}
                        onPress={() => {
                          if (methodActive) return;
                          toggleStore(store.laundryId);
                        }}
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
                // ⚠️ 方法で絞るときは店舗を必ず空にする（上の理由）
                onApply(
                  draftRange,
                  allSelected || methodActive ? [] : draftIds,
                  draftMethod
                )
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
        </View>
      </View>
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
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: color.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    // ⚠️ 高さの上限はここで持つ（中の ScrollView ではなく）
    maxHeight: "88%",
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
  storeNote: {
    fontFamily: font.ui,
    fontSize: 11,
    color: color.textFaint,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
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
