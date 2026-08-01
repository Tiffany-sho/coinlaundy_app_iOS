import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { AuthMessage, AuthScreen } from "@/components/auth/AuthScreen";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/common/ui";
import { Checkbox, Field, Input } from "@/components/common/form";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 新規登録。Web の AuthForm（mode="signup"）を移植。
 *
 * ⚠️ **白基調・カード無し**（2026-07-31）。カードに戻さないこと。teal / cyan を面で使わないこと。
 *    組み方は `app/login.tsx` と `src/components/auth/AuthScreen.tsx` を参照。
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
    <AuthScreen
      title="新規登録"
      subtitle="新しいアカウントを作成するために情報を入力してください"
      /* 来るのはログイン画面からだけ。直リンクで開かれたときのために replace も残す */
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/login"))}
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
          hint="英字と数字を含む8文字以上"
          value={password}
          onChangeText={setPassword}
          textContentType="newPassword"
          placeholder="パスワード"
          visible={showPassword}
          onToggleVisible={() => setShowPassword((v) => !v)}
        />

        {/* ⚠️ 表示切り替えは上の欄と共有する（onToggleVisible を渡さない） */}
        <PasswordField
          label="パスワード（確認）"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          textContentType="newPassword"
          placeholder="パスワードを再入力"
          visible={showPassword}
        />

        {/*
          ⚠️ 同意させる以上、規約は読めなければならないので両方リンクしてある。
             リンク先はアプリ内のテキスト（src/content/legal/）。
             ⚠️ Web の /terms（価格入り）へ出さないこと。Guideline 3.1.3(a)。
        */}
        <Checkbox checked={agreed} onChange={setAgreed} tone="plain">
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

        {/* 主ボタンはアプリ共通の teal グラデーション（前に進む操作の既定） */}
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
    </AuthScreen>
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
  consent: { fontFamily: font.ui, fontSize: 13, color: color.textMuted, lineHeight: 20 },
  link: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
  footerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
});
