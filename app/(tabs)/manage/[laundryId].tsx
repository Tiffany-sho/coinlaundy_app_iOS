import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useBootstrap, useLaundryStates, useUpdateStock } from "@/api/queries";
import { ApiError } from "@/api/client";
import { useOutbox } from "@/offline/OutboxProvider";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { ThresholdControl, stockStyles } from "@/components/manage/StockControls";
import {
  makeExtraStock,
  readExtraStocks,
  readThresholds,
  DEFAULT_STOCK_THRESHOLD,
  type StockThresholds,
} from "@/components/manage/laundryState";
import { CenterMessage, Muted, OfflineBanner, Screen } from "@/components/common/ui";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";
import type { ExtraStock } from "@/api/types";

/**
 * 在庫の設定。種類（extra_stocks）の追加・改名・削除と、警告ラインの変更。
 *
 * 日々の個数変更は編集シート（StateEditSheet）に残し、たまにしか触らないこちらを
 * 別画面へ出した。1 つのシートに全部入れると縦に長くなって、現場で個数を直したいだけの
 * ときに目的の操作が埋もれる。
 *
 * ⚠️ 保存は detergent / softener / extra_stocks / stock_thresholds の**4 項目まとめて**。
 *    Web の updateStockState は省略された項目を既定値
 *    （extra_stocks: [] / stock_thresholds: { detergent: 1, softener: 1 }）で上書きするので、
 *    設定だけ送ると洗剤・柔軟剤の個数が 0 に戻る。個数は編集していないが必ず同梱する。
 */
export default function StockSettings() {
  const { laundryId } = useLocalSearchParams<{ laundryId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const { isOnline } = useOutbox();

  const states = useLaundryStates();
  const bootstrap = useBootstrap();
  const update = useUpdateStock(laundryId);

  const state = states.data?.find((s) => s.laundryId === laundryId);
  const canEdit = bootstrap.data?.organization?.myRole !== "viewer";

  if (states.isLoading && !states.data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  if (!state) {
    return (
      <Screen>
        <CenterMessage
          text={
            states.error instanceof ApiError
              ? states.error.message
              : "この店舗の在庫状況が見つかりませんでした"
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {!isOnline && <OfflineBanner />}
      <SettingsBody
        // 店舗が変わったら下書きを作り直す
        key={state.laundryId}
        laundryName={state.laundryName}
        initialThresholds={readThresholds(state)}
        initialExtras={readExtraStocks(state)}
        canEdit={canEdit}
        isOnline={isOnline}
        isSaving={update.isPending}
        insetTop={insets.top}
        insetBottom={insets.bottom}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/manage"))}
        onConfirmRemove={(name) =>
          dialog.confirm({
            title: `「${name}」を削除しますか？`,
            message: "この在庫の個数と警告ラインの設定が失われます。",
            confirmLabel: "削除する",
            destructive: true,
          })
        }
        onSave={async (thresholds, extras) => {
          try {
            await update.mutateAsync({
              // ⚠️ 個数は触っていないが必ず送る。省くと 0 で上書きされる
              detergent: state.detergent ?? 0,
              softener: state.softener ?? 0,
              extra_stocks: extras.map((item) => ({ ...item, name: item.name.trim() })),
              stock_thresholds: thresholds,
            });
            toast.success(`${state.laundryName}店の在庫設定を保存しました`);
            router.back();
          } catch (error) {
            // BFF の日本語メッセージをそのまま出す
            toast.error(
              error instanceof ApiError ? error.message : "在庫設定を保存できませんでした"
            );
          }
        }}
      />
    </Screen>
  );
}

function SettingsBody({
  laundryName,
  initialThresholds,
  initialExtras,
  canEdit,
  isOnline,
  isSaving,
  insetTop,
  insetBottom,
  onBack,
  onConfirmRemove,
  onSave,
}: {
  laundryName: string;
  initialThresholds: StockThresholds;
  initialExtras: ExtraStock[];
  canEdit: boolean;
  isOnline: boolean;
  isSaving: boolean;
  insetTop: number;
  insetBottom: number;
  onBack: () => void;
  onConfirmRemove: (name: string) => Promise<boolean>;
  onSave: (thresholds: StockThresholds, extras: ExtraStock[]) => void;
}) {
  const [thresholds, setThresholds] = useState<StockThresholds>(initialThresholds);
  const [extras, setExtras] = useState<ExtraStock[]>(initialExtras);

  /**
   * ⚠️ 在庫の更新は Outbox の対象外（設計図 9.3）。圏外で貯めて後から送ると
   *    last-write-wins で他メンバーの更新を巻き戻すので、オフラインでは保存させない。
   */
  const disabled = !canEdit || !isOnline;

  function addExtra() {
    Haptics.selectionAsync().catch(() => {});
    setExtras((prev) => [...prev, makeExtraStock()]);
  }

  async function removeExtra(item: ExtraStock) {
    // 名前も個数も入っていない追加直後の行は、いちいち聞かずに消す
    if (item.name.trim() === "" && item.count === 0) {
      setExtras((prev) => prev.filter((s) => s.id !== item.id));
      return;
    }
    const ok = await onConfirmRemove(item.name.trim() || "（名前なし）");
    if (!ok) return;
    setExtras((prev) => prev.filter((s) => s.id !== item.id));
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insetTop + spacing.sm }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>在庫の設定</Text>
          <Text style={styles.headerSub}>{laundryName}店</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {canEdit && !isOnline && (
          <Muted style={{ marginBottom: spacing.md }}>
            オフラインのあいだは変更できません。電波が戻ってから保存してください。
          </Muted>
        )}

        <Text style={styles.sectionTitle}>警告ライン</Text>
        {/* 判定は「未満」ではなく「以下」。ここを読み違えると現場で 1 個ずれる */}
        <Muted style={styles.sectionLead}>
          設定した個数「以下」になると、ホームと店舗一覧で「要対応」として出ます。
        </Muted>

        <View style={stockStyles.box}>
          <Text style={stockStyles.label}>洗剤（ソープ）</Text>
          <ThresholdControl
            value={thresholds.detergent}
            onChange={(v) => setThresholds((t) => ({ ...t, detergent: v }))}
            disabled={disabled}
            canEdit={canEdit}
          />
        </View>
        <View style={stockStyles.box}>
          <Text style={stockStyles.label}>柔軟剤（ソフター）</Text>
          <ThresholdControl
            value={thresholds.softener}
            onChange={(v) => setThresholds((t) => ({ ...t, softener: v }))}
            disabled={disabled}
            canEdit={canEdit}
          />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>その他の在庫</Text>
        <Muted style={styles.sectionLead}>
          洗剤・柔軟剤以外に数えたいものを登録します。個数の変更は在庫管理シートから。
        </Muted>

        {extras.map((item) => (
          <View key={item.id} style={stockStyles.box}>
            <View style={styles.extraHead}>
              {canEdit ? (
                <TextInput
                  value={item.name}
                  onChangeText={(name) =>
                    setExtras((prev) => prev.map((s) => (s.id === item.id ? { ...s, name } : s)))
                  }
                  editable={!disabled}
                  placeholder="在庫名（例: 漂白剤）"
                  placeholderTextColor={color.textFaint}
                  style={[styles.nameInput, disabled && { opacity: 0.5 }]}
                />
              ) : (
                <Text style={[stockStyles.label, { flex: 1, marginBottom: 0 }]}>
                  {item.name || "（名前なし）"}
                </Text>
              )}
              {canEdit && (
                <Pressable
                  onPress={() => void removeExtra(item)}
                  disabled={disabled}
                  hitSlop={8}
                  accessibilityLabel="この在庫を削除"
                  style={({ pressed }) => [
                    styles.removeButton,
                    disabled && { opacity: 0.4 },
                    pressed && !disabled && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="trash-outline" size={18} color={color.red400} />
                </Pressable>
              )}
            </View>

            <Text style={styles.countNote}>現在 {item.count} 個</Text>

            <ThresholdControl
              value={item.threshold ?? DEFAULT_STOCK_THRESHOLD}
              onChange={(threshold) =>
                setExtras((prev) => prev.map((s) => (s.id === item.id ? { ...s, threshold } : s)))
              }
              disabled={disabled}
              canEdit={canEdit}
            />
          </View>
        ))}

        {canEdit ? (
          <Pressable
            onPress={addExtra}
            disabled={disabled}
            style={({ pressed }) => [
              styles.addButton,
              disabled && { opacity: 0.4 },
              pressed && !disabled && { opacity: 0.8 },
            ]}
          >
            <Ionicons name="add" size={16} color={color.teal} />
            <Text style={styles.addLabel}>在庫の種類を追加</Text>
          </Pressable>
        ) : (
          extras.length === 0 && <Muted>追加の在庫はありません</Muted>
        )}
      </ScrollView>

      {canEdit && (
        <View style={[styles.footer, { paddingBottom: insetBottom + spacing.lg }]}>
          <Pressable onPress={onBack} style={styles.ghostButton}>
            <Text style={styles.ghostLabel}>キャンセル</Text>
          </Pressable>
          <Pressable
            onPress={() => onSave(thresholds, extras)}
            disabled={disabled || isSaving}
            style={({ pressed }) => [
              styles.primaryButton,
              (disabled || isSaving) && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.primaryLabel}>{isSaving ? "保存中…" : "保存"}</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  headerButton: { width: 32, alignItems: "center" },
  headerTitle: { fontFamily: font.uiBold, fontSize: 18, color: color.textMain },
  headerSub: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },

  sectionTitle: { fontFamily: font.uiBold, fontSize: 13, color: color.tealDeeper },
  sectionLead: { fontSize: 11, marginTop: 2, marginBottom: spacing.md },

  extraHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  nameInput: {
    flex: 1,
    fontFamily: font.uiBold,
    fontSize: 14,
    color: color.tealDeeper,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
    paddingVertical: 4,
  },
  removeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  countNote: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: spacing.sm },

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: HIT_SIZE,
    borderRadius: radius.card - 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.cyan300,
  },
  addLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },

  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
    backgroundColor: color.cardBg,
  },
  ghostButton: {
    minHeight: HIT_SIZE,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.divider,
  },
  ghostLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMuted },
  primaryButton: {
    minHeight: HIT_SIZE,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: color.teal,
  },
  primaryLabel: { fontFamily: font.uiBold, fontSize: 14, color: "#FFFFFF" },
});
