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
import { useRouter } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/api/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { Button, GradientHeaderCard, Screen } from "@/components/common/ui";
import { Field, Input } from "@/components/common/form";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * ログイン。Web の AuthForm（mode="login"）と同じ組み方にする。
 *   グラデーションのヘッダー（タイトル + 説明） → 入力欄 → 主ボタン → または → 外部プロバイダ
 *
 * ⚠️ Web は Google と GitHub を出しているが、アプリは Apple のみ。
 *    OAuth の追加には expo-auth-session と Supabase 側のリダイレクト URL 登録が要るため、
 *    動かないボタンを置かないようにしている（Guideline 4.8 上、Apple は必須）。
 */
export default function Login() {
  const router = useRouter();
  const { signInWithPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function onSubmit() {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await signInWithPassword(email, password);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  /** Web の /auth/forgetPassword と同じ再設定メールを送る */
  async function onForgotPassword() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("再設定メールの送信先にするメールアドレスを入力してください");
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "https://www.collecie.com/auth/updatePassword",
    });
    if (resetError) {
      setError("再設定メールを送信できませんでした");
      return;
    }
    setNotice("パスワード再設定のメールを送信しました。メール内のリンクから再設定してください。");
  }

  /**
   * Sign in with Apple。Google を出す以上、審査（Guideline 4.8）で必須。
   * ⚠️ Supabase 側で Apple provider を有効化しないと動かない。
   */
  async function onApple() {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("Apple からトークンを取得できませんでした");

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (signInError) throw new Error("Apple サインインに失敗しました");
      router.replace("/");
    } catch (e: any) {
      // ユーザーが自分でキャンセルした場合はエラー表示しない
      if (e?.code === "ERR_REQUEST_CANCELED") return;
      setError(e instanceof Error ? e.message : "Apple サインインに失敗しました");
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))}
            hitSlop={10}
            style={styles.backRow}
          >
            <Text style={styles.backText}>‹ 戻る</Text>
          </Pressable>

          <GradientHeaderCard
            title="ログイン"
            subtitle="アカウント情報を入力してログインしてください"
          >
            {/* エラーは Web と同じく red.50 + 左の赤帯で出す */}
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

              <Field label="パスワード">
                <View>
                  <Input
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    textContentType="password"
                    placeholder="パスワード"
                    style={{ paddingRight: HIT_SIZE }}
                  />
                  {/* Web の PasswordInput と同じ表示切り替え */}
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

              <Pressable onPress={onForgotPassword} hitSlop={8}>
                <Text style={styles.link}>パスワードを忘れた場合</Text>
              </Pressable>

              <Button
                label="ログイン"
                variant="gradient"
                onPress={onSubmit}
                disabled={!canSubmit}
                loading={submitting}
              />

              {/* Web の AuthForm と同じ、主ボタンの直下に新規登録への導線を置く */}
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>アカウントをお持ちでない方？ </Text>
                <Pressable onPress={() => router.push("/signup")} hitSlop={8}>
                  <Text style={styles.link}>新規登録</Text>
                </Pressable>
              </View>

              {Platform.OS === "ios" && (
                <>
                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>または</Text>
                    <View style={styles.dividerLine} />
                  </View>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={radius.card - 6}
                    style={{ height: HIT_SIZE }}
                    onPress={onApple}
                  />
                </>
              )}
            </View>
          </GradientHeaderCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
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
  link: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: color.divider },
  dividerText: { fontFamily: font.ui, fontSize: 13, color: color.textFaint },
  footerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
});
