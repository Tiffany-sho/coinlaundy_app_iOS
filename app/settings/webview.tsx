import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/ui";
import { color, font, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * 利用規約・プライバシーポリシー・特商法。
 * アプリ内で作り直さず、Web の該当ページをそのまま表示する（設計図 1 章）。
 */
const PAGES: Record<string, { title: string; path: string }> = {
  terms: { title: "利用規約", path: "/terms" },
  privacy: { title: "プライバシーポリシー", path: "/privacy" },
  tokushoho: { title: "特定商取引法に基づく表記", path: "/tokushoho" },
  help: { title: "ヘルプ", path: "/help" },
};

const BASE_URL = "https://www.collecie.com";

export default function SettingsWebView() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const target = PAGES[page ?? "terms"] ?? PAGES.terms;

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{target.title}</Text>
        <View style={styles.headerButton} />
      </View>
      <WebView source={{ uri: `${BASE_URL}${target.path}` }} style={{ flex: 1 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: color.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  headerButton: { width: HIT_SIZE, height: HIT_SIZE, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: font.uiBold, fontSize: 17, color: color.textMain },
});
