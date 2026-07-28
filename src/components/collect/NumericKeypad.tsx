import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 自前の数値キーパッド（設計図 7.4）。
 *
 * iOS 標準のテンキーは小数点や記号が混ざり、グローブ操作で誤爆する。
 * 0-9 / ⌫ / 次へ の 12 キーに絞り、キー高さは 56pt 以上を確保する。
 *
 * ⚠️ 2026-07-28 現在、集金入力画面では未使用。
 *    「Web 版と見た目を揃えたい」という判断で標準の数値キーボードに戻したため。
 *    グローブ操作での誤爆が現場で問題になった場合はこれを差し戻す。
 *    設計図 7.4 の意図はこのファイルに残してある。
 */
const KEY_HEIGHT = 60;

type Props = {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onNext: () => void;
  nextLabel?: string;
  /** 小数点を許可する（重量入力のときだけ true） */
  allowDecimal?: boolean;
};

export function NumericKeypad({
  onDigit,
  onBackspace,
  onNext,
  nextLabel = "次へ",
  allowDecimal = false,
}: Props) {
  function press(action: () => void) {
    // 打鍵のたびに軽い触覚を返す。手元を見ずに操作できるようにするため
    Haptics.selectionAsync().catch(() => {});
    action();
  }

  const rows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [allowDecimal ? "." : "", "0", "backspace"],
  ];

  return (
    <View style={styles.pad}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((keyValue, colIndex) => {
            if (keyValue === "") {
              return <View key={colIndex} style={styles.key} />;
            }
            if (keyValue === "backspace") {
              return (
                <Pressable
                  key={colIndex}
                  onPress={() => press(onBackspace)}
                  style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                >
                  <Ionicons name="backspace-outline" size={24} color={color.textMain} />
                </Pressable>
              );
            }
            return (
              <Pressable
                key={colIndex}
                onPress={() => press(() => onDigit(keyValue))}
                style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
              >
                <Text style={styles.keyLabel}>{keyValue}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <Pressable
        onPress={() => press(onNext)}
        style={({ pressed }) => [styles.next, pressed && styles.keyPressed]}
      >
        <Text style={styles.nextLabel}>{nextLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    backgroundColor: color.divider,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: "row", gap: spacing.sm },
  key: {
    flex: 1,
    height: KEY_HEIGHT,
    backgroundColor: color.cardBg,
    borderRadius: radius.card - 6,
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: { opacity: 0.6 },
  keyLabel: { fontFamily: font.mono, fontSize: 26, color: color.textMain },
  next: {
    height: KEY_HEIGHT,
    backgroundColor: color.teal,
    borderRadius: radius.card - 6,
    alignItems: "center",
    justifyContent: "center",
  },
  nextLabel: { fontFamily: font.uiBold, fontSize: 17, color: "#FFFFFF" },
});
