import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/common/ui";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * 利用規約・プライバシーポリシー。
 * アプリ内で作り直さず、Web の該当ページをそのまま表示する（設計図 1 章）。
 *
 * ⚠️ 出せるのは `/app/*` のアプリ専用ページだけ。理由:
 *
 *   - `/terms` は「Proプラン ¥780/月」「クレジットカードによる月次自動引き落とし」
 *     「解約はマイページの『プランを管理する』から」を含む
 *   - `/tokushoho` は特定商取引法の性質上、販売価格と決済条件を**必ず**書く
 *   - `/help` は「アップグレードができます」を含む
 *
 *   これらは App Store Guideline 3.1.3(a)（アプリ外の購入手段への誘導）に触れる。
 *   `/app/terms` は料金・解約の条文を落としたアプリ専用版で、Web 側でナビとフッターも
 *   消してある（coin-laundry-app の src/app/feacher/partials/appLegalPaths.js）。
 *
 * ⚠️ 特商法はリンクしない。アプリ内課金が無い以上、アプリに掲示義務は生じない。
 *    「Web で契約できます」と読める導線を置いた時点でリジェクト事由になる。
 */
const PAGES = {
  terms: { title: "利用規約", path: "/app/terms" },
  privacy: { title: "プライバシーポリシー", path: "/app/privacy" },
} as const satisfies Record<string, { title: string; path: string }>;

type PageKey = keyof typeof PAGES;

const BASE_URL = "https://www.collecie.com";

/**
 * この WebView が開いてよい URL。
 *
 * ⚠️ ページ側のナビは消してあるが、本文中のリンク（プライバシーポリシー内の相互参照など）や
 *    リダイレクトで Web アプリ本体へ抜ける経路が残る。そこからプラン画面に到達できるので、
 *    許可リストで塞ぐ。増やすときは Web 側の appLegalPaths.js も一緒に直すこと。
 */
function isAllowed(url: string): boolean {
  if (!url.startsWith(`${BASE_URL}/app/`)) return false;
  const path = url.slice(BASE_URL.length).split(/[?#]/)[0].replace(/\/$/, "");
  return Object.values(PAGES).some((page) => page.path === path);
}

export default function SettingsWebView() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** 再読み込みのたびに増やして WebView を作り直す（reload() の ref を持たずに済む） */
  const [attempt, setAttempt] = useState(0);

  const key = (page && page in PAGES ? page : "terms") as PageKey;
  const target = PAGES[key];
  const uri = `${BASE_URL}${target.path}`;

  function retry() {
    setFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {target.title}
        </Text>
        <View style={styles.headerButton} />
      </View>

      {failed ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={32} color={color.textFaint} />
          <Text style={styles.errorTitle}>{target.title}を読み込めませんでした</Text>
          <Text style={styles.errorLead}>通信状況を確認してもう一度お試しください。</Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.retryLabel}>再読み込み</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            key={attempt}
            source={{ uri }}
            style={{ flex: 1 }}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onHttpError={({ nativeEvent }) => {
              if (nativeEvent.statusCode >= 400) {
                setLoading(false);
                setFailed(true);
              }
            }}
            /* 最初の 1 枚だけ通し、そこから先の遷移はすべて止める。
               ⚠️ true を返すと WebView 内で開いてしまう。外部ブラウザにも逃がさない
                  （Linking.openURL を呼ばない）＝購入導線への到達手段を残さない */
            onShouldStartLoadWithRequest={(request) =>
              request.url === uri || isAllowed(request.url)
            }
          />
          {loading && (
            <View style={styles.loading} pointerEvents="none">
              <ActivityIndicator color={color.teal} />
            </View>
          )}
        </View>
      )}
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
  headerButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: font.uiBold,
    fontSize: 17,
    color: color.textMain,
  },
  /* 読み込み中は覆い隠す。WebView の下地が一瞬透けるのを防ぐ。
     ⚠️ absoluteFillObject は RN 0.86 で削除済み（absoluteFill は spread できない）ので直書き */
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.appBg,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  errorTitle: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  errorLead: { fontFamily: font.ui, fontSize: 13, color: color.textMuted, textAlign: "center" },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: HIT_SIZE,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: color.teal,
    marginTop: spacing.md,
  },
  retryLabel: { fontFamily: font.uiBold, fontSize: 14, color: "#FFFFFF" },
});
