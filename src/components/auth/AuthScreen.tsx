import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useKeyboardVisible } from "@/components/common/useKeyboardVisible";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * ログイン・新規登録の枠。**白基調**（2026-07-31 の指示）。
 *
 * ⚠️ **カード（`GradientHeaderCard`）に戻さないこと。** フォームは白い紙の上に
 *    直接置く。見出し・入力欄・ボタンだけで区切りを作る。
 * ⚠️ **teal / cyan を面で使わない。** 使ってよいのは主ボタン（`variant="gradient"`）と
 *    リンク・フォーカス枠などの**線と点だけ**。背景やヘッダーを teal で塗ると
 *    「シアン基調」に戻る。
 * ⚠️ **入力欄は `tone="plain"` を指定する。** 既定は白い下地 + `divider` の枠なので、
 *    白い紙の上では枠も下地も見えず入力欄だと分からない。
 *
 * ⚠️ ステータスバーはここでは触らない。ルートの既定（`dark`）がそのまま合う。
 */
export function AuthScreen({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle: string;
  /**
   * 戻る先。**渡さなければ「戻る」を出さない。**
   * ⚠️ 押しても何も起きないボタンを置かないための出し分け。
   *    ログインも新規登録も `/welcome` から来るので、**今はどちらも渡している**
   *    （2026-08-06 に起点を `/welcome` へ戻したため）。
   */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  /* ⚠️ キーボードが出ている間はホームバーが覆われるので insets.bottom を足さない
        （足すと入力欄とキーボードの間に帯状の余白が出る。docs/traps.md） */
  const keyboardVisible = useKeyboardVisible();

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        /* ⚠️ keyboardVerticalOffset は渡さない。この画面の上にネイティブの
              ヘッダは無いので、渡すとヘッダ分を二重に数えて余白が出る */
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: spacing.xl,
            paddingTop: insets.top + spacing.sm,
            paddingBottom: (keyboardVisible ? 0 : insets.bottom) + spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {onBack && (
            <Pressable onPress={onBack} hitSlop={12} style={styles.back} accessibilityRole="button">
              <Ionicons name="chevron-back" size={20} color={color.teal} />
              <Text style={styles.backLabel}>戻る</Text>
            </Pressable>
          )}

          {/* ⚠️ 「戻る」が無い画面では上が詰まるので、その分だけ下げる */}
          <View style={[styles.head, !onBack && { marginTop: spacing.xxl }]}>
            <Text style={styles.logo}>Collecie</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * フォームの上に出す 1 行の知らせ。左に色帯を付ける形は Web の AuthForm と同じ。
 */
export function AuthMessage({ tone, text }: { tone: "error" | "notice"; text: string }) {
  const isError = tone === "error";
  return (
    <View style={[styles.message, isError ? styles.messageError : styles.messageNotice]}>
      <Ionicons
        name={isError ? "alert-circle" : "information-circle"}
        size={17}
        color={isError ? color.red500 : color.teal}
      />
      <Text style={[styles.messageText, { color: isError ? "#B91C1C" : color.tealDeeper }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ⚠️ appBg（#F0F9FF）ではなく純白。ルートの Stack の contentStyle が appBg なので、
        ここを省くと薄い水色が透ける */
  root: { flex: 1, backgroundColor: color.cardBg },
  back: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", minHeight: 36 },
  backLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.teal },
  head: { alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.xxl },
  logo: {
    fontFamily: font.uiBold,
    fontSize: 24,
    color: color.tealDeeper,
    letterSpacing: 0.5,
    marginBottom: spacing.xl,
  },
  title: { fontFamily: font.uiBold, fontSize: 26, color: color.textMain, textAlign: "center" },
  subtitle: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 20,
    color: color.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  message: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  messageError: { backgroundColor: color.red50, borderLeftColor: color.red400 },
  messageNotice: { backgroundColor: color.cyan50, borderLeftColor: color.cyan400 },
  messageText: { fontFamily: font.ui, fontSize: 13, lineHeight: 20, flex: 1 },
});
