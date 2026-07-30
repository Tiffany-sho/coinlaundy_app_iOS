import { useEffect, useState } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap, useUpdateProfile } from "@/api/queries";
import { AvatarPicker } from "@/components/settings/AvatarPicker";
import { apiErrorMessage } from "@/components/stores/StoreForm";
import { Field, Input } from "@/components/common/form";
import { useToast } from "@/components/common/toast";
import { Button, Card, CenterMessage, Muted, Screen, Title } from "@/components/common/ui";
import { color, font, spacing } from "@/theme/tokens";

/**
 * アカウント情報の編集。Web の /settings/account/edit（AccountEditForm）に対応する。
 *
 * 編集できるのはアイコン・氏名・表示名の 3 つ。
 *   - メールアドレスと権限は変えられない（前者は Supabase Auth 側、後者は管理者の操作）
 *   - ⚠️ **アイコンだけはボタンを待たずにその場で保存される**（AvatarPicker のコメント参照）
 *
 * ⚠️ 氏名と表示名は**どちらも必須**。Web の updateProfile が
 *    `if (!fullname || !username)` で弾くので、片方だけ送ると 400 になる。
 */
export default function AccountEdit() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const bootstrap = useBootstrap();
  const update = useUpdateProfile();

  const profile = bootstrap.data?.profile;

  const [fullname, setFullname] = useState("");
  const [username, setUsername] = useState("");

  /**
   * ⚠️ 依存は profile の**中身**にする。オブジェクトを入れると、bootstrap が
   *    取り直されるたびに新しい参照が来て入力中の文字が消える。
   */
  useEffect(() => {
    setFullname(profile?.full_name ?? "");
    setUsername(profile?.username ?? "");
  }, [profile?.full_name, profile?.username]);

  if (bootstrap.isLoading && !bootstrap.data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  const trimmedName = fullname.trim();
  const trimmedUsername = username.trim();
  const canSubmit =
    trimmedName.length > 0 && trimmedUsername.length > 0 && !update.isPending;

  async function onSubmit() {
    try {
      await update.mutateAsync({ fullname: trimmedName, username: trimmedUsername });
      toast.success("アカウント情報を更新しました");
      router.back();
    } catch (e) {
      // ⚠️ BFF の日本語をそのまま出す
      toast.error(apiErrorMessage(e, "アカウント情報を更新できませんでした"));
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        /* ⚠️ keyboardVerticalOffset は渡さない。この画面の上にネイティブの
              ヘッダは無いので、渡すと帯状の余白が出る（docs/traps.md 参照） */
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingTop: insets.top + spacing.md,
            paddingBottom: spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={color.teal} />
            <Text style={styles.backLabel}>戻る</Text>
          </Pressable>

          <Title style={{ fontSize: 22, marginBottom: spacing.lg }}>アカウント編集</Title>

          <Card>
            <View style={{ marginBottom: spacing.xl }}>
              <AvatarPicker avatarUrl={profile?.avatar_url} username={profile?.username} />
            </View>

            <View style={{ gap: spacing.lg }}>
              <Field label="氏名">
                <Input
                  value={fullname}
                  onChangeText={setFullname}
                  placeholder="山田 太郎"
                  autoComplete="name"
                  returnKeyType="next"
                />
              </Field>

              <Field label="表示名" hint="集金の記録やメンバー一覧に出る名前です">
                <Input
                  value={username}
                  onChangeText={setUsername}
                  placeholder="たろう"
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={() => canSubmit && void onSubmit()}
                />
              </Field>
            </View>
          </Card>

          {/* 変えられないものは読み取りだけ出す。無いと「編集できないのか壊れているのか」が分からない */}
          <View style={styles.readonly}>
            <ReadonlyRow label="メールアドレス" value={bootstrap.data?.user.email ?? "—"} />
            <Muted style={styles.readonlyNote}>
              メールアドレスと権限はこの画面では変更できません。権限の変更は管理者に依頼してください。
            </Muted>
          </View>

          <Button
            label="更新する"
            variant="gradient"
            onPress={() => void onSubmit()}
            disabled={!canSubmit}
            loading={update.isPending}
            style={{ marginTop: spacing.xl }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readonlyRow}>
      <Muted>{label}</Muted>
      <Text style={styles.readonlyValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  backLabel: { fontFamily: font.ui, fontSize: 15, color: color.teal },
  readonly: { marginTop: spacing.lg },
  readonlyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  readonlyValue: {
    fontFamily: font.ui,
    fontSize: 14,
    color: color.textMain,
    flexShrink: 1,
    textAlign: "right",
  },
  readonlyNote: { fontSize: 11, marginTop: spacing.sm },
});
