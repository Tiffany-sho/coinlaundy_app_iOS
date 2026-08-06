import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/api/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { AuthMessage, AuthScreen } from "@/components/auth/AuthScreen";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/common/ui";
import { Field, Input } from "@/components/common/form";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * ログイン。
 *
 * ⚠️ **白基調・カード無し**（2026-07-31）。それまでは薄い水色の背景に
 *    `GradientHeaderCard` を 1 枚置く形だった。
 *    ⚠️ **カードに戻さないこと。teal / cyan を面で使わないこと。**
 *    組み方は `src/components/auth/AuthScreen.tsx` のコメントを参照。
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
   * Sign in with Apple。Guideline 4.8 で必須。
   * ⚠️ Supabase の Apple プロバイダの Client IDs に bundle ID を入れておくこと
   *    （Services ID と .p8 は要らない。理由は docs/contracts.md）。
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
    <AuthScreen
      title="ログイン"
      subtitle="アカウント情報を入力してログインしてください"
      /* ⚠️ **「戻る」を出す**（2026-08-06）。起点が `/welcome` に戻ったので
            戻り先ができた。⚠️ 直接ここへ落ちる経路（セッション切れなど）は
            もう無いが、積まれていないときは起点へ落とす */
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))}
    >
      {error && <AuthMessage tone="error" text={error} />}
      {notice && <AuthMessage tone="notice" text={notice} />}

      <View style={{ gap: spacing.lg }}>
        <Field label="メールアドレス">
          <Input
            tone="plain"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="メールアドレス"
          />
        </Field>

        <PasswordField
          label="パスワード"
          value={password}
          onChangeText={setPassword}
          textContentType="password"
          placeholder="パスワード"
          visible={showPassword}
          onToggleVisible={() => setShowPassword((v) => !v)}
        />

        <Pressable onPress={onForgotPassword} hitSlop={8} style={{ alignSelf: "flex-start" }}>
          <Text style={styles.link}>パスワードを忘れた場合</Text>
        </Pressable>

        {/* 主ボタンはアプリ共通の teal グラデーション（前に進む操作の既定） */}
        <Button
          label="ログイン"
          variant="gradient"
          onPress={onSubmit}
          disabled={!canSubmit}
          loading={submitting}
        />

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
            {/* ⚠️ 白地なので BLACK。WHITE は紙に溶けて枠が見えなくなる */}
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
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  /* ⚠️ divider（#F1F5F9）ではなく border。白の上では前者は 1.07:1 で見えない */
  dividerLine: { flex: 1, height: 1, backgroundColor: color.border },
  dividerText: { fontFamily: font.ui, fontSize: 13, color: color.textFaint },
  footerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
});
