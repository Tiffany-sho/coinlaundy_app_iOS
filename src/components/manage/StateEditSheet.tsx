import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUpdateMachines, useUpdateStock } from "@/api/queries";
import { ApiError } from "@/api/client";
import { useOutbox } from "@/offline/OutboxProvider";
import { Counter, stockStyles } from "@/components/manage/StockControls";
import { useToast } from "@/components/common/toast";
import { Muted } from "@/components/common/ui";
import { readExtraStocks, readThresholds, type StockThresholds } from "@/components/manage/laundryState";
import { color, font, radius, shadow, spacing, HIT_SIZE } from "@/theme/tokens";
import type { ExtraStock, LaundryState, MachineState } from "@/api/types";

/**
 * 在庫 / 設備の編集シート。管理タブと店舗詳細の両方から開く。
 *
 * もとは app/(tabs)/manage.tsx の中にあったものを、店舗詳細のタイルからも
 * 同じシートを開けるように切り出した。Web も NowLaundryNum.jsx（在庫）と
 * MachinesState.jsx（設備）の 1 組の Dialog を店舗詳細・一覧の両方で使い回している。
 *
 * 見た目は Web の Dialog に合わせる：teal-pale のヘッダ + グラデーションのアイコン。
 *
 * 在庫側でここが扱うのは**日々の個数変更だけ**。
 * 種類の追加・改名・削除と警告ラインは app/(tabs)/manage/[laundryId].tsx へ出した
 * （全部入れると縦に長くなり、個数を直したいだけのときに目的の操作が埋もれるため）。
 *
 * ⚠️ それでも保存は detergent / softener / extra_stocks / stock_thresholds の
 *    **4 項目まとめて**送る。updateStockState は省略した項目を既定値で上書きするので、
 *    ここで触っていない警告ラインも読み込んだ値をそのまま同梱すること。
 */

export type StateEditMode = "stock" | "equipment";

export function StateEditSheet({
  state,
  mode,
  canEdit = true,
  onClose,
  onOpenSettings,
}: {
  /** null の間は閉じている。開くときに対象の店舗状態を渡す */
  state: LaundryState | null;
  mode: StateEditMode;
  /** viewer は読み取り専用。Web の NowLaundryNum / MachinesState の canEdit と同じ意味 */
  canEdit?: boolean;
  onClose: () => void;
  /** 在庫の設定ページへ。省略するとリンク自体を出さない */
  onOpenSettings?: () => void;
}) {
  return (
    <Modal
      visible={Boolean(state)}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      {state && (
        // key を付けて店舗やモードが変わったら作り直す。
        // 中の下書き（洗剤の数など）は useState の初期値で持っているので、
        // 作り直さないと前に開いた店舗の値が残る。
        <SheetBody
          key={`${state.laundryId}-${mode}`}
          state={state}
          mode={mode}
          canEdit={canEdit}
          onClose={onClose}
          onOpenSettings={onOpenSettings}
        />
      )}
    </Modal>
  );
}

function SheetBody({
  state,
  mode,
  canEdit,
  onClose,
  onOpenSettings,
}: {
  state: LaundryState;
  mode: StateEditMode;
  canEdit: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { isOnline } = useOutbox();
  const toast = useToast();
  const updateStock = useUpdateStock(state.laundryId);
  const updateMachines = useUpdateMachines(state.laundryId);

  const [detergent, setDetergent] = useState(state.detergent ?? 0);
  const [softener, setSoftener] = useState(state.softener ?? 0);
  const [thresholds, setThresholds] = useState<StockThresholds>(() => readThresholds(state));
  const [extras, setExtras] = useState<ExtraStock[]>(() => readExtraStocks(state));
  const [machines, setMachines] = useState<MachineState[]>(state.machines ?? []);

  /**
   * ⚠️ 在庫・設備の更新は Outbox の対象外（設計図 9.3）。
   *    圏外で貯めて後から送ると last-write-wins で他メンバーの更新を巻き戻すため、
   *    オフラインのあいだは保存ボタン自体を無効化する。この方針は崩さないこと。
   */
  const disabled = !canEdit || !isOnline;

  async function save() {
    if (disabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    try {
      if (mode === "stock") {
        // ⚠️ 4 項目まとめて送る。Web の updateStockState は省略された項目を
        //    既定値（extra_stocks: [] / stock_thresholds: {1,1}）で上書きするので、
        //    洗剤と柔軟剤だけ送ると追加在庫と警告ラインが消える。
        await updateStock.mutateAsync({
          detergent,
          softener,
          extra_stocks: extras.map((item) => ({ ...item, name: item.name.trim() })),
          stock_thresholds: thresholds,
        });
        toast.success(`${state.laundryName}店の在庫を更新しました`);
      } else {
        await updateMachines.mutateAsync(machines);
        toast.success(`${state.laundryName}店の設備状態を更新しました`);
      }
      onClose();
    } catch (error) {
      // BFF の日本語メッセージをそのまま出す（権限なし・通信不可などを出し分けたい）
      toast.error(
        error instanceof ApiError
          ? error.message
          : mode === "stock"
            ? `${state.laundryName}店の在庫更新に失敗しました`
            : `${state.laundryName}店の設備状態の更新に失敗しました`
      );
      // 失敗時はシートを開いたままにして、入力し直さずに再送できるようにする
    }
  }

  /**
   * 追加在庫の個数変更。
   * 種類の追加・改名・削除と警告ラインは在庫の設定ページ
   * （app/(tabs)/manage/[laundryId].tsx）へ移した。ここでは個数だけ触る。
   */
  function changeExtra(updated: ExtraStock) {
    setExtras((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  /**
   * 故障フラグの切り替え。
   * ⚠️ 故障を解除したら故障内容も消す（Web の useMachinesState.js の changeMachineState と同じ）。
   *    残したままにすると直ったはずの機械に古い故障内容がぶら下がる。
   */
  function toggleBreak(machineId: string, next: boolean) {
    Haptics.selectionAsync().catch(() => {});
    setMachines((prev) =>
      prev.map((m) =>
        m.id === machineId ? { ...m, break: next, comment: next ? m.comment : "" } : m
      )
    );
  }

  function changeComment(machineId: string, comment: string) {
    setMachines((prev) => prev.map((m) => (m.id === machineId ? { ...m, comment } : m)));
  }

  const isPending = updateStock.isPending || updateMachines.isPending;

  return (
    // 追加在庫の名前入力がキーボードで隠れないようにシートごと持ち上げる
    <KeyboardAvoidingView
      style={styles.modalRoot}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.sheetHeader}>
          <LinearGradient
            colors={["#0891B2", "#0E7490"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sheetIcon}
          >
            <Ionicons name={mode === "stock" ? "cube" : "construct"} size={18} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.sheetTitle}>
            {mode === "stock" ? "在庫管理" : "設備状態管理"}（{state.laundryName}店）
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.sheetClose}>
            <Ionicons name="close" size={20} color={color.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ padding: spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          {/* 無効化した理由は必ず出す。押せない理由が分からないと現場で詰まる */}
          {canEdit && !isOnline && (
            <Muted style={{ marginBottom: spacing.md }}>
              オフラインのあいだは変更できません。電波が戻ってから保存してください。
            </Muted>
          )}

          {mode === "stock" ? (
            <>
              <StockRow
                label="洗剤（ソープ）"
                value={detergent}
                onChange={setDetergent}
                disabled={disabled}
              />
              <StockRow
                label="柔軟剤（ソフター）"
                value={softener}
                onChange={setSoftener}
                disabled={disabled}
              />

              {/* 追加在庫。Web の「その他の在庫」と同じ並び。
                  ここでは個数だけ。名前の変更・追加・削除・警告ラインは設定ページ側 */}
              {extras.length > 0 && (
                <View style={styles.extraSection}>
                  <Text style={styles.extraHeading}>その他の在庫</Text>
                  {extras.map((item) => (
                    <StockRow
                      key={item.id}
                      label={item.name.trim() || "（名前なし）"}
                      value={item.count}
                      onChange={(count) => changeExtra({ ...item, count })}
                      disabled={disabled}
                    />
                  ))}
                </View>
              )}

              {/* 種類の追加と警告ラインは頻繁には触らないので別ページへ出した。
                  ⚠️ シートは Modal なので、開いたまま遷移すると新しい画面がシートの
                     裏に描かれる。必ず閉じてから push すること */}
              {canEdit && onOpenSettings && (
                <Pressable
                  onPress={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  style={({ pressed }) => [styles.settingsLink, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="options-outline" size={17} color={color.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsLinkLabel}>在庫の設定</Text>
                    <Text style={styles.settingsLinkHint}>種類の追加・削除、警告ラインの変更</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={color.cyan300} />
                </Pressable>
              )}
            </>
          ) : machines.length === 0 ? (
            <Muted>設備が登録されていません。</Muted>
          ) : (
            machines.map((machine) => (
              <View
                key={machine.id}
                style={[
                  styles.machineBox,
                  {
                    backgroundColor: machine.break ? "#FFF7ED" : "#ECFEFF",
                    borderColor: machine.break ? color.orange200 : color.cyan200,
                  },
                ]}
              >
                <View style={styles.machineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.machineName}>{machine.name}</Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: machine.break ? color.orange300 : color.cyan200 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: machine.break ? "#7C2D12" : color.tealDeeper },
                        ]}
                      >
                        {machine.break ? "故障中" : "稼働中"}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={machine.break}
                    disabled={disabled}
                    onValueChange={(next) => toggleBreak(machine.id, next)}
                    trackColor={{ true: color.orange500, false: color.divider }}
                  />
                </View>

                {/* 故障内容。Web の MachinesState.jsx も故障中のときだけ出す */}
                {machine.break && (
                  <View style={styles.commentBox}>
                    <Text style={styles.commentLabel}>故障内容</Text>
                    {canEdit ? (
                      <TextInput
                        value={machine.comment || ""}
                        onChangeText={(text) => changeComment(machine.id, text)}
                        editable={!disabled}
                        placeholder="故障の詳細を入力してください..."
                        placeholderTextColor={color.textFaint}
                        multiline
                        style={styles.commentInput}
                      />
                    ) : (
                      <Muted>{machine.comment || "（詳細なし）"}</Muted>
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.sheetFooter}>
          <Pressable onPress={onClose} style={styles.sheetGhost}>
            <Text style={styles.sheetGhostLabel}>{canEdit ? "キャンセル" : "閉じる"}</Text>
          </Pressable>
          {canEdit && (
            <Pressable
              onPress={save}
              disabled={disabled || isPending}
              style={({ pressed }) => [
                styles.sheetPrimary,
                (disabled || isPending) && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.sheetPrimaryLabel}>{isPending ? "保存中…" : "保存"}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** 洗剤・柔軟剤の 1 ブロック。シートでは個数だけ（警告ラインは在庫の設定ページ） */
function StockRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <View style={stockStyles.box}>
      <Text style={stockStyles.label}>{label}</Text>
      <Counter value={value} onChange={onChange} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: color.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // 追加在庫が増えても画面からはみ出さないよう、シート全体で高さを制限する
    maxHeight: "88%",
    ...shadow.hero,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: color.tealPale,
    padding: spacing.lg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  sheetTitle: { flex: 1, fontFamily: font.uiBold, fontSize: 16, color: color.tealDeeper },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },

  counterBox: {
    borderWidth: 1,
    borderColor: color.cyan100,
    borderRadius: radius.card - 4,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  counterLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper, marginBottom: spacing.md },
  counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counterButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderRadius: radius.pill,
    backgroundColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: { fontFamily: font.mono, fontSize: 30, color: "#164E63" },

  thresholdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  thresholdLabel: { flex: 1, fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  thresholdStepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  thresholdButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.orange200,
    alignItems: "center",
    justifyContent: "center",
  },
  thresholdValue: {
    minWidth: 46,
    textAlign: "center",
    fontFamily: font.uiBold,
    fontSize: 13,
    color: color.orange500,
  },

  settingsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: HIT_SIZE,
    borderRadius: radius.card - 4,
    borderWidth: 1,
    borderColor: color.cyan100,
    backgroundColor: color.cyan50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  settingsLinkLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
  settingsLinkHint: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 1 },

  extraSection: { marginTop: spacing.sm },
  extraHeading: {
    fontFamily: font.uiBold,
    fontSize: 12,
    color: color.textMuted,
    marginBottom: spacing.md,
  },
  extraHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  extraNameInput: {
    flex: 1,
    minHeight: HIT_SIZE,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: font.uiBold,
    fontSize: 14,
    color: color.tealDeeper,
  },
  removeButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBox: { backgroundColor: color.red50, borderColor: color.red400, gap: spacing.md },
  confirmText: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  confirmActions: { flexDirection: "row", gap: spacing.sm },
  confirmCancel: {
    flex: 1,
    minHeight: HIT_SIZE,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.divider,
    backgroundColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMuted },
  confirmDelete: {
    flex: 1,
    minHeight: HIT_SIZE,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: color.red400,
    backgroundColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDeleteLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.red500 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: HIT_SIZE,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.cyan300,
  },
  addLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.teal },

  machineBox: {
    borderWidth: 2,
    borderRadius: 14,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  machineRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  machineName: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  badge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeText: { fontFamily: font.uiBold, fontSize: 11 },
  commentBox: {
    marginTop: spacing.md,
    backgroundColor: color.cardBg,
    borderWidth: 1,
    borderColor: color.orange200,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  commentLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain, marginBottom: spacing.sm },
  commentInput: {
    fontFamily: font.ui,
    fontSize: 15,
    color: color.textMain,
    minHeight: 72,
    textAlignVertical: "top",
  },

  sheetFooter: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  sheetGhost: {
    flex: 1,
    minHeight: HIT_SIZE,
    borderRadius: radius.card - 6,
    borderWidth: 2,
    borderColor: color.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetGhostLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMuted },
  sheetPrimary: {
    flex: 1,
    minHeight: HIT_SIZE,
    borderRadius: radius.card - 6,
    backgroundColor: color.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetPrimaryLabel: { fontFamily: font.uiBold, fontSize: 15, color: "#FFFFFF" },
});
