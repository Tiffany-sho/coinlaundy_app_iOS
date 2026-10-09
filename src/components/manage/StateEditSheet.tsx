import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import { MachineStateList } from "@/components/manage/MachineStateList";
import { useToast } from "@/components/common/toast";
import { Muted } from "@/components/common/ui";
import {
  readExtraStocks,
  readThresholds,
  type StockThresholds,
} from "@/components/manage/laundryState";
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
  /**
   * 「在庫の設定」を押したことを覚えておき、**シートが閉じ切ってから**遷移する。
   *
   * ⚠️ **iOS はモーダルを出したまま画面遷移できない。** 2026-08-01 まで
   *    `onClose(); onOpenSettings();` と同じ tick で呼んでいて、閉じるアニメーションの
   *    最中に `router.push` が走っていた。画面の階層が壊れ、**以降タブを切り替えても
   *    何も表示されない**という形で出る（競合なので毎回は起きない）。
   * ⚠️ ここで直すと呼び出し 3 か所（ホーム / 管理 / 店舗詳細）が一度に直る。
   *    **呼び出し側で `router.push` を待たせ直さないこと。**
   */
  const pendingSettings = useRef(false);

  function runPendingSettings() {
    if (!pendingSettings.current) return;
    pendingSettings.current = false;
    onOpenSettings?.();
  }

  function requestSettings() {
    pendingSettings.current = true;
    onClose();
    /* ⚠️ onDismiss は iOS 専用。他プラットフォームは閉じた次のフレームで走らせる */
    if (Platform.OS !== "ios") requestAnimationFrame(runPendingSettings);
  }

  return (
    <Modal
      visible={Boolean(state)}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onDismiss={runPendingSettings}
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
          onOpenSettings={onOpenSettings && requestSettings}
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
  const [thresholds] = useState<StockThresholds>(() => readThresholds(state));
  const [extras, setExtras] = useState<ExtraStock[]>(() => readExtraStocks(state));
  const [machines, setMachines] = useState<MachineState[]>(state.machines ?? []);

  /**
   * ⚠️ 在庫・設備の更新は Outbox の対象外（設計図 9.3）。
   *    圏外で貯めて後から送ると last-write-wins で他メンバーの更新を巻き戻すため、
   *    オフラインのあいだは保存ボタン自体を無効化する。この方針は崩さないこと。
   */
  const disabled = !canEdit || !isOnline;
  const isPending = updateStock.isPending || updateMachines.isPending;

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
   * 故障フラグの切り替え。
   * ⚠️ 故障を解除したら故障内容も消す（Web の useMachinesState.js の changeMachineState と同じ）。
   */
  function toggleBreak(machineId: string, next: boolean) {
    Haptics.selectionAsync().catch(() => {});
    setMachines((prev) =>
      prev.map((m) =>
        m.id === machineId ? { ...m, break: next, comment: next ? m.comment : "" } : m
      )
    );
  }

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
                      onChange={(count) =>
                        setExtras((prev) =>
                          prev.map((x) => (x.id === item.id ? { ...x, count } : x))
                        )
                      }
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
                    /* ⚠️ ここで onClose と遷移を並べないこと。
                          onOpenSettings は「閉じ切ってから遷移する」に差し替えてある */
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
          ) : (
            <MachineStateList
              machines={machines}
              canEdit={canEdit}
              disabled={disabled}
              onToggleBreak={toggleBreak}
              onChangeComment={(machineId, comment) =>
                setMachines((prev) =>
                  prev.map((m) => (m.id === machineId ? { ...m, comment } : m))
                )
              }
            />
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
  sheetIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: { flex: 1, fontFamily: font.uiBold, fontSize: 16, color: color.tealDeeper },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },

  extraSection: { marginTop: spacing.sm },
  extraHeading: {
    fontFamily: font.uiBold,
    fontSize: 12,
    color: color.textMuted,
    marginBottom: spacing.md,
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
