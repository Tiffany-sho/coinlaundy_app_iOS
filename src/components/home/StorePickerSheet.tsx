import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, font, radius, shadow, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * クイックアクションの「店舗を選ぶ」シート。
 * Web の QuickActionDialog.jsx に当たる。
 *
 * 店舗行の右側は 2 通り。
 *   modes 未指定 … シェブロン 1 つ（選ぶ＝その店舗のページへ行く）
 *   modes 指定   … ボタンを並べる（在庫 / 設備）。その場で編集シートを開くため、
 *                  「店舗を選ぶ → もう一度モードを選ぶ」の 2 段階にしない。
 *                  ⚠️ 段を増やすと Modal を 2 枚重ねることになり iOS で表示に失敗する。
 */

export type StorePickerOption = { id: string; name: string };

export type StorePickerMode<T extends string> = { value: T; label: string };

export function StorePickerSheet<T extends string>({
  visible,
  title,
  stores,
  isLoading,
  emptyText,
  modes,
  onPick,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  stores: StorePickerOption[];
  isLoading: boolean;
  emptyText: string;
  modes?: readonly StorePickerMode<T>[];
  onPick: (storeId: string, mode?: T) => void;
  onClose: () => void;
  /** iOS で閉じ切ったあとに呼ばれる。次の Modal を開くのはここ */
  onDismiss?: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android の戻る / Web の Esc
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      {/*
        ⚠️ **背景と本体は兄弟にする。入れ子にしない。**
           入れ子にすると指を降ろした時点で外側の Pressable が responder を取り、
           中の一覧の**1 回目のスクロールが空振りして 2 回目でやっと動く。**
           StateEditSheet / MachineListSheet と同じ形。
      */}
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="閉じる" />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>

          {isLoading ? (
            <View style={styles.sheetPlaceholder}>
              <ActivityIndicator color={color.teal} />
            </View>
          ) : stores.length === 0 ? (
            <View style={styles.sheetPlaceholder}>
              <Text style={styles.sheetEmpty}>{emptyText}</Text>
            </View>
          ) : (
            /* 店舗が多い組織でも選べるように、リストだけスクロールさせる */
            <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
              {stores.map((store) =>
                modes ? (
                  <View key={store.id} style={styles.storeRowStatic}>
                    <Text style={styles.storeName} numberOfLines={1}>
                      {store.name}店
                    </Text>
                    <View style={styles.modeRow}>
                      {modes.map((mode) => (
                        <Pressable
                          key={mode.value}
                          onPress={() => onPick(store.id, mode.value)}
                          style={({ pressed }) => [styles.modeButton, pressed && styles.modePressed]}
                        >
                          <Text style={styles.modeLabel}>{mode.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Pressable
                    key={store.id}
                    onPress={() => onPick(store.id)}
                    style={({ pressed }) => [styles.storeRow, pressed && styles.storeRowPressed]}
                  >
                    <Text style={styles.storeName} numberOfLines={1}>
                      {store.name}店
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={color.cyan300} />
                  </Pressable>
                )
              )}
            </ScrollView>
          )}

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.cancelLabel}>キャンセル</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    padding: spacing.xl,
    ...shadow.hero,
  },
  sheetTitle: {
    fontFamily: font.uiBold,
    fontSize: 16,
    color: color.tealDeeper,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  sheetList: { maxHeight: 320 },
  sheetPlaceholder: { paddingVertical: spacing.xl, alignItems: "center" },
  sheetEmpty: { fontFamily: font.ui, fontSize: 14, color: color.textMuted, textAlign: "center" },

  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: HIT_SIZE,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.divider,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  storeRowPressed: { backgroundColor: color.cyan50, borderColor: color.cyan200 },
  /* モードボタンを持つ行は行自体を押せないので Pressable にしない */
  storeRowStatic: {
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.divider,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  storeName: { flex: 1, fontFamily: font.uiBold, fontSize: 14, color: color.textMain },

  modeRow: { flexDirection: "row", gap: spacing.sm },
  modeButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.cyan200,
    backgroundColor: color.cyan50,
  },
  modePressed: { backgroundColor: color.cyan100 },
  modeLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.tealDeeper },

  cancelButton: {
    minHeight: HIT_SIZE,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  cancelLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.textMuted },
});
