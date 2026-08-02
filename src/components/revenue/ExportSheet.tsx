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
  /* ⚠️ 「1か月」は**今月だけ**（start = end = 当月）。他と同じく「直近 N か月」の N=1 */
  { months: 1, label: "1か月" },
  { months: 3, label: "3か月" },
  { months: 6, label: "6か月" },
  { months: 12, label: "12か月" },
  { months: 60, label: "5年" },
] as const;

const FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel" },
] as const satisfies readonly { value: ExportFormat; label: string }[];

type Split = "period" | "store" | "none";

/** ⚠️ 画面に出すのは 2 つだけ。`"none"` は店舗を固定したときに内部で使う */
const SPLITS = [
  { value: "period", label: "月ごと" },
  { value: "store", label: "店舗ごと" },
] as const satisfies readonly { value: "period" | "store"; label: string }[];

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
  lockedStoreId,
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
  /**
   * この店舗だけを書き出す（店舗別の収益ページから開いたとき）。
   *
   * ⚠️ **`stores` を 1 件にするだけでは足りない。** 選択が空＝全店舗という規約なので、
   *    `storeIds` を省略した瞬間 **BFF は組織の全店舗を書き出す。**
   *    店舗を固定する意思をここで明示すること。
   * ⚠️ 固定中は店舗の選択肢もシートの分け方も出さない（1 店舗では選ぶ意味が無い）。
   */
  lockedStoreId?: string;
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

  /**
   * ⚠️ **1 店舗に固定しているときは分けない（1 シートにまとめる）。**
   *    月で分けると期間ぶんシートが増えて、1 店舗の推移を横に並べて見られない。
   *    ⚠️ `"store"` で代用しないこと。グループは `laundryName` で作るので、
   *       **店舗を改名していると 1 店舗なのに 2 シートに割れる**
   *       （詳細は Web の `groupRecords`）。
   */
  const effectiveSplit: Split = lockedStoreId ? "none" : split;
  const lockedStoreName = lockedStoreId
    ? stores.find((s) => s.laundryId === lockedStoreId)?.laundryName ?? ""
    : "";

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
        /* ⚠️ 固定中は選択を見ない。undefined を渡すと全店舗になる（lockedStoreId のコメント） */
        storeIds: lockedStoreId
          ? [lockedStoreId]
          : selectedIds.length > 0
            ? selectedIds
            : undefined,
        splitMethod: effectiveSplit,
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
      {/*
        ⚠️ **背景と本体は兄弟にする。入れ子にしない。**
           `<Pressable backdrop><Pressable sheet><ScrollView>` と重ねると、
           指を降ろした時点で外側の Pressable が responder を取ってしまい、
           **1 回目のスクロールが空振りして 2 回目でやっと動く。**
           背景を absoluteFill の兄弟にすれば ScrollView が Pressable の中に
           入らないので、1 回目から素直にスクロールする。
           ⚠️ 兄弟なので、シートの上をタップしても背景には届かない
           （＝閉じない）。入れ子の Pressable は元々そのためだけに置いていた。
      */}
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={busy ? undefined : onClose}
          accessibilityLabel="閉じる"
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Ionicons name="download-outline" size={18} color={color.tealDeeper} />
            <Text style={styles.headerTitle}>データの書き出し</Text>
          </View>

          {/*
            ⚠️ **高さは親（sheet）で決め、ScrollView 自身に maxHeight を持たせない。**
               `maxHeight` だけだと ScrollView の高さが**中身から決まる**ので、
               モーダルのスライド中に「中身 = 枠」の状態で 1 回レイアウトが走り、
               **その瞬間はスクロールの必要が無い＝指を降ろしても動かない。**
               次のレイアウトで 460 に収まって初めてスクロールできるようになる。
               これが「1 回目が空振りして 2 回目で動く」の正体。
               sheet 側を画面比で止めて ScrollView は flexShrink に任せると、
               最初のレイアウトで高さが確定するので 1 回目から動く
               （`StateEditSheet` が最初からこの形）。
          */}
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
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

              {/* ⚠️ 固定中は「どの店舗か」を必ず出す。書き出したファイルを開くまで
                     全店舗ぶんか 1 店舗ぶんか分からない、という状態にしない */}
              {lockedStoreId && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.label}>店舗</Text>
                  {/* 選べないので触っても何も起きない。PeriodFilterSheet と同じ薄め方 */}
                  <View style={[styles.chipRow, { opacity: 0.65 }]}>
                    <Chip
                      label={lockedStoreName || "この店舗"}
                      selected
                      dotColor={STORE_COLORS[0]}
                      onPress={() => {}}
                    />
                  </View>
                </>
              )}

              {!lockedStoreId && stores.length > 1 && (
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
                     扱えないので、BFF 側で必ず 1 本にまとめている。
                  ⚠️ 1 店舗に固定しているときは出さない（「店舗ごと」を選んでも
                     シートが 1 枚しかできず、選択肢として意味を持たない） */}
              {format === "xlsx" && !lockedStoreId && (
                <>
                  <Text style={styles.label}>シートの分け方</Text>
                  <SegmentedTabs options={SPLITS} value={split} onChange={setSplit} />
                </>
              )}

              <Text style={styles.note}>
                {lockedStoreName ? `${lockedStoreName}店の` : ""}
                {monthLabel(range.start)}〜{monthLabel(range.end)}の集金データを
                {format !== "xlsx"
                  ? "1 つの CSV ファイルに書き出します"
                  : effectiveSplit === "none"
                    ? "1 つの Excel ファイル・1 枚のシートに書き出します"
                    : `1 つの Excel ファイルにまとめ、${effectiveSplit === "period" ? "月" : "店舗"}ごとにシートを分けます`}
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: color.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    // ⚠️ 高さの上限はここで持つ（中の ScrollView ではなく）。理由は ScrollView のコメント
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
