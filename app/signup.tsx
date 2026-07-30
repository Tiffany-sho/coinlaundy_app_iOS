import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { Button, GradientHeaderCard, Screen } from "@/components/common/ui";
import { Checkbox, Field, Input } from "@/components/common/form";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * 新規登録。Web の AuthForm（mode="signup"）を移植。
 *
 * 登録そのものは supabase.auth.signUp を叩くだけで BFF を経由しない。
 * Supabase 側が mailer_autoconfirm = true なので、成功した時点でセッションが張られ、
 * そのまま初回セットアップへ進む（メール確認の往復がない）。
 * 将来メール確認を有効にした場合は needsEmailConfirmation が true で返るので、
 * その場合は「確認メールを送りました」を出してログイン画面へ戻す。
 */
export default function Signup() {
  const router = useRouter();
  const { signUpWithPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    agreed &&
    !submitting;

  async function onSubmit() {
    setError(null);
    setNotice(null);

    // Web は <input type="email" required> にブラウザの検証を任せている。
    // RN にはそれが無いので、同じ文言をここで出す。
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("有効なメールアドレスを入力してください。");
      return;
    }

    const invalid = validatePassword(password);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません。");
      return;
    }

    setSubmitting(true);
    try {
      const { needsEmailConfirmation } = await signUpWithPassword(email, password);
      if (needsEmailConfirmation) {
        setNotice(
          "確認メールを送信しました。メール内のリンクを開いてからログインしてください。"
        );
        return;
      }
      // セッションが張られているので、そのまま初回セットアップへ
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/* 未ログイン画面からもログイン画面からも来るので、来た方へ戻す */}
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))}
            hitSlop={10}
            style={styles.backRow}
          >
            <Text style={styles.backText}>‹ 戻る</Text>
          </Pressable>

          <GradientHeaderCard
            title="新規登録"
            subtitle="新しいアカウントを作成するために情報を入力してください"
          >
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            {notice && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            )}

            <View style={{ gap: spacing.lg }}>
              <Field label="メールアドレス">
                <Input
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  placeholder="メールアドレス"
                />
              </Field>

              <Field label="パスワード" hint="英字と数字を含む8文字以上">
                <View>
                  <Input
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    textContentType="newPassword"
                    placeholder="パスワード"
                    style={{ paddingRight: HIT_SIZE }}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.eye}
                    hitSlop={8}
                    accessibilityLabel={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                  >
                    <Text style={styles.eyeText}>{showPassword ? "隠す" : "表示"}</Text>
                  </Pressable>
                </View>
              </Field>

              <Field label="パスワード（確認）">
                <Input
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  textContentType="newPassword"
                  placeholder="パスワードを再入力"
                />
              </Field>

              {/*
                ⚠️ 同意させる以上、規約は読めなければならないので両方リンクしてある。
                   ただし Web の /terms には価格（¥780/月 など）と
                   「プランを管理する」の記述が含まれる。
                   提出前に価格・決済・アップグレードへの言及を除いた
                   アプリ用の規約ページ（例 /terms/app）を用意し、
                   下の page=terms をそちらに差し替えること。
              */}
              <Checkbox checked={agreed} onChange={setAgreed}>
                <Text style={styles.consent}>
                  <Text
                    style={styles.link}
                    onPress={() => router.push("/settings/legal?page=terms" as Href)}
                  >
                    利用規約
                  </Text>
                  および
                  <Text
                    style={styles.link}
                    onPress={() => router.push("/settings/legal?page=privacy" as Href)}
                  >
                    プライバシーポリシー
                  </Text>
                  に同意する
                </Text>
              </Checkbox>

              <Button
                label="新規登録"
                variant="gradient"
                onPress={onSubmit}
                disabled={!canSubmit}
                loading={submitting}
              />

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>既にアカウントをお持ちの方？ </Text>
                <Pressable onPress={() => router.replace("/login")} hitSlop={8}>
                  <Text style={styles.link}>ログイン</Text>
                </Pressable>
              </View>
            </View>
          </GradientHeaderCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** ブラウザの type="email" 相当。厳密な RFC 検証はサーバー側に任せる */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * パスワードの条件。
 * ⚠️ Web の signup サーバーアクションと同じ規則・同じ文言。片方だけ変えないこと。
 */
function validatePassword(password: string): string | null {
  if (password.length < 8) return "パスワードは8文字以上で入力してください。";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "パスワードは英字と数字を両方含めてください。";
  }
  return null;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  backRow: { alignSelf: "flex-start", marginBottom: spacing.md, paddingVertical: 4 },
  backText: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
  errorBox: {
    backgroundColor: color.red50,
    borderLeftWidth: 4,
    borderLeftColor: color.red400,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { fontFamily: font.uiBold, fontSize: 13, color: "#B91C1C", lineHeight: 19 },
  noticeBox: {
    backgroundColor: color.cyan50,
    borderLeftWidth: 4,
    borderLeftColor: color.cyan400,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noticeText: { fontFamily: font.ui, fontSize: 13, color: color.tealDeeper, lineHeight: 19 },
  eye: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: HIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeText: { fontFamily: font.uiBold, fontSize: 12, color: color.textMuted },
  consent: { fontFamily: font.ui, fontSize: 13, color: color.textMuted, lineHeight: 20 },
  link: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
  footerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
});
