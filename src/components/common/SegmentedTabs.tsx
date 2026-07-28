import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * カード切り替え用のタブ。
 *
 * 見た目は管理タブ（app/(tabs)/manage.tsx）の「在庫 / 設備」と同じ
 * 「薄い溝の上に白いつまみ」。アプリ内で切り替え UI の形を揃えるために切り出してある。
 *
 * ⚠️ 横スワイプではなくボタンで切り替える。
 *    react-native-web では onMomentumScrollEnd が発火せず、横スクロール式は
 *    ブラウザ確認時に選択位置を見失う（app/welcome.tsx のコメント参照）。
 *    切り替え先のカードは高さがそれぞれ違うので、ページングも噛み合わない。
 */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.track, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.button, active && styles.buttonActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: color.divider,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: spacing.md,
  },
  button: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
  },
  buttonActive: { backgroundColor: color.cardBg },
  label: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
  labelActive: { fontFamily: font.uiBold, color: color.teal },
});
