import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { STOCK_UNIT } from "@/components/manage/laundryState";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * 在庫まわりの共通部品。
 * 日々の個数変更はシート（StateEditSheet）、警告ラインと在庫の種類は設定ページ
 * （app/(tabs)/manage/[laundryId].tsx）と置き場所が分かれたので、ここに出してある。
 */

/** 個数の増減。現場でグローブのまま押すので大きめに取る */
export function Counter({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  function step(delta: number) {
    if (disabled) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(Math.max(0, value + delta));
  }
  return (
    <View style={styles.counterRow}>
      <Pressable
        onPress={() => step(-1)}
        disabled={disabled || value <= 0}
        accessibilityLabel="個数を減らす"
        style={[styles.counterButton, (disabled || value <= 0) && { opacity: 0.4 }]}
      >
        <Ionicons name="remove" size={22} color="#FFFFFF" />
      </Pressable>
      <Text style={styles.counterValue}>{value}</Text>
      <Pressable
        onPress={() => step(1)}
        disabled={disabled}
        accessibilityLabel="個数を増やす"
        style={[styles.counterButton, disabled && { opacity: 0.4 }]}
      >
        <Ionicons name="add" size={22} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

/**
 * 警告ラインの増減。
 * 文言は Web の ThresholdControl と揃える（「警告ライン（以下で警告）」「{n}個以下で警告」）。
 * 判定が「未満」ではなく「以下」であることが読み取れないと、現場で 1 個ずれる。
 */
export function ThresholdControl({
  value,
  onChange,
  disabled,
  canEdit,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  canEdit: boolean;
}) {
  function step(delta: number) {
    if (disabled) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(Math.max(0, value + delta));
  }

  if (!canEdit) {
    return (
      <View style={styles.thresholdRow}>
        <Text style={styles.thresholdLabel}>警告ライン</Text>
        <Text style={styles.thresholdValue}>
          {value}
          {STOCK_UNIT}以下で警告
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.thresholdRow}>
      <Text style={styles.thresholdLabel}>警告ライン（以下で警告）</Text>
      <View style={styles.thresholdStepper}>
        <Pressable
          onPress={() => step(-1)}
          disabled={disabled || value <= 0}
          accessibilityLabel="警告ラインを減らす"
          style={({ pressed }) => [
            styles.thresholdButton,
            (disabled || value <= 0) && { opacity: 0.4 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="remove" size={16} color={color.orange500} />
        </Pressable>
        <Text style={styles.thresholdValue}>
          {value}
          {STOCK_UNIT}
        </Text>
        <Pressable
          onPress={() => step(1)}
          disabled={disabled}
          accessibilityLabel="警告ラインを増やす"
          style={({ pressed }) => [
            styles.thresholdButton,
            disabled && { opacity: 0.4 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add" size={16} color={color.orange500} />
        </Pressable>
      </View>
    </View>
  );
}

export const stockStyles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: color.cyan100,
    borderRadius: radius.card - 4,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: font.uiBold,
    fontSize: 14,
    color: color.tealDeeper,
    marginBottom: spacing.md,
  },
});

const styles = StyleSheet.create({
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
});
