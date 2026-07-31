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
import { useExportFunds } from "@/api/queries";
import { errorMessage } from "@/components/funds/fundCache";
import { Chip } from "@/components/common/Chip";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { MonthField } from "@/components/revenue/MonthPicker";
import {
  currentMonthIndex,
  monthLabel,
  monthStartEpoch,
  type MonthIndex,
  type MonthRange as Range,
} from "@/components/revenue/monthIndex";
import { color, font, radius, spacing, STORE_COLORS } from "@/theme/tokens";
import type { ExportFile, ExportFormat, StoreRevenue } from "@/api/types";

/** 遡れる上限。絞り込みシート（PeriodFilterSheet）と揃えてある */
const MAX_MONTHS_BACK = 60;

const PRESETS = [
  { months: 3, label: "3か月" },
  { months: 6, label: "6か月" },
  { months: 12, label: "12か月" },
  { months: 60, label: "5年" },
] as const;

const FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel" },
] as const satisfies readonly { value: ExportFormat; label: string }[];

type Split = "period" | "store";

const SPLITS = [
  { value: "period", label: "月ごと" },
  { value: "store", label: "店舗ごと" },
] as const satisfies readonly { value: Split; label: string }[];

/**
 * 集金データの書き出しシート。Web の ExportPanel.jsx の移植。
 *
 * ⚠️ **成功しても、このシートの中ではトーストを出さない。**
 *    ToastProvider はルートの絶対配置なので RN の Modal の**下**に隠れる
 *    （docs/traps.md の「モーダル画面でトーストが見えない」と同じ）。
 *    成功したら `onDone` で親へ渡し、シートを閉じてから共有シートとトーストを出す。
 *    失敗はシートを開いたまま**下の帯**に出す（期間を狭めて押し直せるように）。
 *
 * ⚠️ 期間は Web のような日付ではなく**月単位**にしてある。
 *    このページの他の期間指定（月別売上カード）と単位を揃えるため。
 */
export function ExportSheet({
  open,
  onClose,
  onDone,
  onDismiss,
  stores,
  canExport,
}: {
  open: boolean;
  onClose: () => void;
  /** 書き出せた。⚠️ 親がシートを閉じてから保存・共有すること */
  onDone: (file: ExportFile) => void;
  /** Modal が実際に消えたあと（iOS のみ発火）。共有シートを開く合図に使う */
  onDismiss: () => void;
  stores: StoreRevenue[];
  /** Pro 以上か。⚠️ 表示の出し分けだけ。実際の可否はサーバが判定する */
  canExport: boolean;
}) {
  const current = currentMonthIndex();
  const oldest = current - (MAX_MONTHS_BACK - 1);

  const [range, setRange] = useState<Range>({ start: current - 11, end: current });
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [split, setSplit] = useState<Split>("period");
  /** 空 = 全店舗 */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportFunds = useExportFunds();

  // 開き直したら前回のエラーと開きっぱなしのパネルを消す（条件は残す）
  useEffect(() => {
    if (!open) return;
    setError(null);
    setExpanded(null);
  }, [open]);

  function setStart(index: MonthIndex) {
    setRange((prev) => ({ start: index, end: Math.max(prev.end, index) }));
    setExpanded(null);
  }

  function setEnd(index: MonthIndex) {
    setRange((prev) => ({ start: Math.min(prev.start, index), end: index }));
    setExpanded(null);
  }

  function toggleStore(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function run() {
    setError(null);
    try {
      const file = await exportFunds.mutateAsync({
        format,
        startEpoch: monthStartEpoch(range.start),
        /**
         * ⚠️ **終端は「含む」。** BFF は `lte` で引くので、翌月 1 日をそのまま渡すと
         *    翌月 1 日の集金まで入ってしまう。1 ミリ秒引いてその月の最後に着地させる
         *    （/funds/chart の `to` は排他で、向きが逆なので取り違えに注意）。
         */
        endEpoch: monthStartEpoch(range.end + 1) - 1,
        storeIds: selectedIds.length > 0 ? selectedIds : undefined,
        splitMethod: split,
      });
      onDone(file);
    } catch (e) {
      setError(errorMessage(e, "書き出しに失敗しました"));
    }
  }

  const busy = exportFunds.isPending;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Ionicons name="download-outline" size={18} color={color.tealDeeper} />
            <Text style={styles.headerTitle}>データの書き出し</Text>
          </View>

          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            <View style={styles.body}>
              <Text style={styles.label}>期間</Text>
              <View style={styles.chipRow}>
                {PRESETS.map((preset) => (
                  <Chip
                    key={preset.months}
                    label={preset.label}
                    selected={
                      range.start === current - (preset.months - 1) && range.end === current
                    }
                    onPress={() => {
                      setRange({ start: current - (preset.months - 1), end: current });
                      setExpanded(null);
                    }}
                  />
                ))}
              </View>

              {/* ⚠️ 開くのはどちらか一方だけ。両方開くとシートが画面より高くなる */}
              <MonthField
                label="開始月"
                value={range.start}
                min={oldest}
                max={current}
                open={expanded === "start"}
                onToggle={() => setExpanded((prev) => (prev === "start" ? null : "start"))}
                onChange={setStart}
              />
              <MonthField
                label="終了月"
                value={range.end}
                min={range.start}
                max={current}
                open={expanded === "end"}
                onToggle={() => setExpanded((prev) => (prev === "end" ? null : "end"))}
                onChange={setEnd}
              />

              {stores.length > 1 && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>店舗</Text>
                    {selectedIds.length > 0 && (
                      <Pressable onPress={() => setSelectedIds([])} hitSlop={8}>
                        <Text style={styles.linkLabel}>全店舗に戻す</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.chipRow}>
                    {stores.map((store, i) => (
                      <Chip
                        key={store.laundryId}
                        label={store.laundryName}
                        dotColor={STORE_COLORS[i % STORE_COLORS.length]}
                        // 空配列＝全店舗なので、1 つも選んでいないときは全部を選択中として描く
                        selected={selectedIds.length === 0 || selectedIds.includes(store.laundryId)}
                        onPress={() => toggleStore(store.laundryId)}
                      />
                    ))}
                  </View>
                </>
              )}

              <View style={styles.divider} />

              <Text style={styles.label}>ファイル形式</Text>
              <SegmentedTabs options={FORMATS} value={format} onChange={setFormat} />

              {/* ⚠️ 分割が効くのは Excel だけ。CSV は共有シートが 1 ファイルしか
                     扱えないので、BFF 側で必ず 1 本にまとめている */}
              {format === "xlsx" && (
                <>
                  <Text style={styles.label}>シートの分け方</Text>
                  <SegmentedTabs options={SPLITS} value={split} onChange={setSplit} />
                </>
              )}

              <Text style={styles.note}>
                {monthLabel(range.start)}〜{monthLabel(range.end)}の集金データを
                {format === "xlsx"
                  ? `1 つの Excel ファイルにまとめ、${split === "period" ? "月" : "店舗"}ごとにシートを分けます`
                  : "1 つの CSV ファイルに書き出します"}
              </Text>

              {!canExport && (
                <View style={styles.planNote}>
                  <Ionicons name="lock-closed-outline" size={14} color={color.orange500} />
                  <Text style={styles.planNoteLabel}>
                    データの書き出しは Pro プラン以上でご利用いただけます
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* ⚠️ 失敗はここに出す。トーストはこのモーダルの下に隠れて読めない */}
          {error !== null && (
            <View style={styles.errorBar}>
              <Ionicons name="alert-circle" size={15} color="#FFFFFF" />
              <Text style={styles.errorLabel}>{error}</Text>
            </View>
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              disabled={busy}
              style={({ pressed }) => [styles.footerButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.cancelLabel}>キャンセル</Text>
            </Pressable>
            <Pressable
              onPress={() => void run()}
              disabled={busy || !canExport}
              style={({ pressed }) => [
                styles.footerButton,
                styles.submitButton,
                (busy || !canExport) && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitLabel}>書き出す</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  label: {
    fontFamily: font.uiBold,
    fontSize: 11,
    color: color.textMuted,
    marginBottom: spacing.sm,
  },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  linkLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.teal, marginBottom: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: color.divider, marginVertical: spacing.lg },
  note: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, lineHeight: 16 },
  planNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  planNoteLabel: { flex: 1, fontFamily: font.ui, fontSize: 11, color: color.orange500 },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.orange500,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  errorLabel: { flex: 1, fontFamily: font.ui, fontSize: 12, color: "#FFFFFF" },
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
    minWidth: 108,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
  },
  submitButton: { backgroundColor: color.teal },
  cancelLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMuted },
  submitLabel: { fontFamily: font.uiBold, fontSize: 14, color: "#FFFFFF" },
});
