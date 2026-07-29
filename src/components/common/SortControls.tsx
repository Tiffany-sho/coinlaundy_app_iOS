import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 並び替え。軸ごとにボタンを 1 つ置き、**押すたびに向きが反転する**。
 *
 * ⚠️ ダイアログ（dialog.choose）に戻さないこと。「開く → 選ぶ → 閉じる」の 3 手が要り、
 *    しかも今どの軸・どの向きで並んでいるかが開くまで分からなかった。
 *
 * 効いている軸だけを塗り、向きを言葉で出す（矢印だけだと「上が新しい」のか
 * 「上が古い」のか伝わらない）。効いていない軸は見出しだけにして、
 * 2 つ同時に効いていると誤解されないようにする。
 *
 * 軸が 1 つだけなら常に効いている状態になり、単なる向きのトグルとして使える
 * （売上履歴の「新しい順 ↔ 古い順」がこれ）。
 */

export type SortDirection = "asc" | "desc";

export type SortAxis<T extends string> = {
  value: T;
  /** ボタンの見出し。短く */
  label: string;
  /** 向きの説明。「昇順」ではなく中身が分かる言葉にする（例: あ→わ / 新しい順） */
  hint: Record<SortDirection, string>;
  /** その軸に切り替えた直後の向き */
  defaultDirection: SortDirection;
};

export function SortControls<T extends string>({
  axes,
  field,
  direction,
  onChange,
}: {
  axes: readonly SortAxis<T>[];
  field: T;
  direction: SortDirection;
  onChange: (field: T, direction: SortDirection) => void;
}) {
  return (
    <View style={styles.row}>
      {axes.map((axis) => {
        const active = axis.value === field;
        const shown = active ? direction : axis.defaultDirection;
        return (
          <Pressable
            key={axis.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              // 効いている軸をもう一度押したら反転、別の軸なら既定の向きで切り替え
              onChange(
                axis.value,
                active ? (direction === "asc" ? "desc" : "asc") : axis.defaultDirection
              );
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${axis.label}で並び替え`}
            accessibilityValue={{ text: active ? axis.hint[shown] : "選択されていません" }}
            accessibilityHint={active ? "もう一度押すと逆順になります" : undefined}
            style={({ pressed }) => [
              styles.button,
              active && styles.buttonActive,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Ionicons
              name={shown === "asc" ? "arrow-up" : "arrow-down"}
              size={13}
              color={active ? color.cyan700 : color.textFaint}
            />
            <Text
              style={[styles.label, active && styles.labelActive]}
              numberOfLines={1}
            >
              {axis.label}
            </Text>
            {active && <Text style={styles.hint}>{axis.hint[shown]}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.divider,
    backgroundColor: color.cardBg,
  },
  buttonActive: { borderColor: color.cyan400, backgroundColor: color.cyan50 },
  label: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, flexShrink: 1 },
  labelActive: { fontFamily: font.uiBold, color: color.cyan700 },
  hint: { fontFamily: font.ui, fontSize: 11, color: color.cyan700, opacity: 0.85 },
});
