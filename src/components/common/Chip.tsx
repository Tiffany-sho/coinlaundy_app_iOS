import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 選択チップ。Web の PeriodFilterButton 内にある丸い店舗チップと同じ見た目。
 *
 * 収益の絞り込み・書き出しシート、店舗一覧の地域絞り込みで同じ形を使うので
 * ここに置いてある。⚠️ **各画面でコピーしないこと**（角丸と選択色がすぐずれる）。
 */
export function Chip({
  label,
  selected,
  dotColor,
  count,
  onPress,
}: {
  label: string;
  selected: boolean;
  /** 店舗色などの目印。省略すると出ない */
  dotColor?: string;
  /** 件数を右に添える。省略すると出ない */
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && { opacity: 0.75 },
      ]}
    >
      {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined && (
        <Text style={[styles.count, selected && styles.labelSelected]}>{count}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 34,
    // ⚠️ 店舗名は自由入力で長くなりうる。上限を切らないと 1 つで 1 行を占める
    maxWidth: 140,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.divider,
    backgroundColor: color.cardBg,
  },
  chipSelected: { borderColor: color.cyan400, backgroundColor: color.cyan50 },
  dot: { width: 8, height: 8, borderRadius: 2 },
  label: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, flexShrink: 1 },
  labelSelected: { fontFamily: font.uiBold, color: color.cyan700 },
  count: { fontFamily: font.ui, fontSize: 10, color: color.textFaint },
});
