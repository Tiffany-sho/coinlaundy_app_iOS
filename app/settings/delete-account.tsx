import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDialog } from "@/components/common/dialog";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/api/client";
import { useBootstrap, useDeletionSummary } from "@/api/queries";
import { supabase } from "@/api/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Card, CenterMessage, Muted, Screen, Title } from "@/components/common/ui";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * アカウント削除（App Store Guideline 5.1.1(v)）。
 *
 * 審査要件として「アプリ内から削除を開始できること」に加え、
 * 誤操作を防ぐために 影響の説明 → パスワード再入力 → 確認ダイアログ の 3 段構えにする。
 */
export default function DeleteAccount() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const { session, signOut } = useAuth();
  const bootstrap = useBootstrap();
  const summary = useDeletionSummary();

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = session?.user.email ?? bootstrap.data?.user.email ?? "";

  async function onDelete() {
    setError(null);

    // 本人確認。パスワードでの再認証が通らなければ削除しない
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError) {
      setError("パスワードが違います");
      return;
    }

    const ok = await dialog.confirm({
      title: "アカウントを削除しますか？",
      message: "この操作は取り消せません。",
      confirmLabel: "削除する",
      destructive: true,
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await apiFetch("/account", { method: "DELETE" });
      await signOut();
      router.replace("/welcome");
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  if (summary.isLoading && !summary.data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  const s = summary.data;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md }}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={color.teal} />
          <Text style={styles.backLabel}>戻る</Text>
        </Pressable>

        <Title style={{ fontSize: 22, marginBottom: spacing.lg }}>アカウントを削除</Title>

        <Card style={{ marginBottom: spacing.lg, borderColor: color.red400 }}>
          <View style={styles.warnHead}>
            <Ionicons name="warning" size={18} color={color.red500} />
            <Text style={styles.warnTitle}>削除すると元に戻せません</Text>
          </View>

          {s?.isOwner ? (
            <>
              <Muted style={{ marginBottom: spacing.sm }}>
                あなたは「{s.orgName}」のオーナーです。削除すると組織ごと消えます。
              </Muted>
              <Row label="削除される店舗" value={`${s.storeCount} 件`} />
              <Row label="削除される集金記録" value={`${s.fundCount} 件`} />
              <Muted style={{ marginTop: spacing.sm }}>
                他のメンバーもこの組織のデータを見られなくなります。
              </Muted>
            </>
          ) : s?.orgName ? (
            <>
              <Muted style={{ marginBottom: spacing.sm }}>
                「{s.orgName}」から抜けます。組織のデータは残ります。
              </Muted>
              <Row label="あなたの集金記録" value={`${s.fundCount} 件`} />
              <Muted style={{ marginTop: spacing.sm }}>
                集金記録は組織の売上履歴として残り、集金者は「退会済みユーザー」と表示されます。
              </Muted>
            </>
          ) : (
            <Muted>プロフィールとログイン情報が削除されます。</Muted>
          )}
        </Card>

        <Text style={styles.label}>確認のためパスワードを入力してください</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColor={color.textFaint}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Button
          label="アカウントを削除する"
          variant="danger"
          onPress={onDelete}
          disabled={password.length === 0}
          loading={submitting}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Muted>{label}</Muted>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  backLabel: { fontFamily: font.ui, fontSize: 15, color: color.teal },
  warnHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  warnTitle: { fontFamily: font.uiBold, fontSize: 15, color: color.red500 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  value: { fontFamily: font.mono, fontSize: 15, color: color.textMain },
  label: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain, marginBottom: spacing.xs },
  input: {
    minHeight: HIT_SIZE,
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    fontFamily: font.ui,
    fontSize: 16,
    color: color.textMain,
    borderWidth: 1,
    borderColor: color.divider,
  },
  error: { fontFamily: font.ui, fontSize: 14, color: color.red500, marginTop: spacing.md },
});
