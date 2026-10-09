import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 画面の中の節を区切る 2 つ。
 *
 * ui.tsx にある SectionHeading は**文字だけ**の見出しで、こちらはアイコン付き。
 * 用途が違うので統合しない（本文の節にはアイコン、カードの表題には文字だけ）。
 */

export function SectionHead({
  icon,
  label,
  /** 見出しの下に説明文を続けるときは余白を自分で持つので消す */
  noMargin,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  noMargin?: boolean;
}) {
  return (
    <View style={[styles.head, noMargin && { marginBottom: 0 }]}>
      <Ionicons name={icon} size={19} color={color.teal} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  label: { fontFamily: font.uiBold, fontSize: 15, color: color.teal },
  divider: { height: 1, backgroundColor: color.divider, marginVertical: spacing.xl },
});
