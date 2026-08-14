import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/common/ui";
import { color, font, spacing, HIT_SIZE } from "@/theme/tokens";

const BASE_URL = "https://www.collecie.com";

/**
 * 利用規約・プライバシーポリシー・特商法。
 * アプリ内で作り直さず、該当ページをそのまま表示する（設計図 1 章）。
 *
 * ⚠️ eula は Web の /terms ではなく Apple 標準 EULA を指す。
 *    Web の /terms は「Proプラン ¥780/月」等の価格・決済・アップグレード文言を含み、
 *    アプリ内で表示すると Guideline 3.1.3(a)（外部購入への誘導）に触れるため使えない。
 *    Apple 標準 EULA は課金文言を含まず、Guideline 3.1.2(c) が求める
 *    「利用規約（EULA）への機能するリンク」をそのまま満たす。
 */
const PAGES: Record<string, { title: string; uri: string }> = {
  terms: { title: "利用規約", uri: `${BASE_URL}/terms` },
  privacy: { title: "プライバシーポリシー", uri: `${BASE_URL}/privacy` },
  tokushoho: { title: "特定商取引法に基づく表記", uri: `${BASE_URL}/tokushoho` },
  help: { title: "ヘルプ", uri: `${BASE_URL}/help` },
  eula: {
    title: "利用規約（EULA）",
    uri: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
  },
};

export default function SettingsWebView() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const target = PAGES[page ?? "privacy"] ?? PAGES.privacy;

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{target.title}</Text>
        <View style={styles.headerButton} />
      </View>
      <WebView source={{ uri: target.uri }} style={{ flex: 1 }} />
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
