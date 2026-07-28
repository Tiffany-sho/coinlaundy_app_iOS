import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/api/client";
import { queryKeys, useBootstrap } from "@/api/queries";
import { useAuth } from "@/auth/AuthProvider";
import { Button, GradientHeaderCard, Screen } from "@/components/ui";
import { Field, FormError, Input } from "@/components/form";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";

const ROLE_LABEL: Record<string, string> = {
  admin: "店舗管理者",
  collecter: "集金担当者",
  viewer: "閲覧者",
};

/**
 * 組織参加。Web の JoinOrganizationHome + JoinOrgForm を移植。
 *
 * ⚠️ Web ではこの画面は「admin 以外で組織未所属」のときだけ出る（page.js の分岐）。
 *    admin は初期設定の中で組織を作るため、ここには来ない。
 *    ただしアプリでは組織作成が失敗したまま admin が取り残される可能性があるので、
 *    admin にはこの画面で「組織を作成する」フォームを出して復帰できるようにしている。
 */
export default function JoinOrganization() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { data } = useBootstrap();

  const username = data?.profile?.username ?? "";
  const role = data?.profile?.role ?? "collecter";
  const isAdmin = role === "admin";

  const [adminEmail, setAdminEmail] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  async function submit(fn: () => Promise<unknown>, onDone: () => void) {
    setError(null);
    setSubmitting(true);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
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
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <GradientHeaderCard
            icon={isAdmin ? "business-outline" : "people-outline"}
            title={isAdmin ? "組織の作成" : "組織への参加"}
            subtitle={
              isAdmin
                ? "集金チームを管理する組織を作成します"
                : "管理者から共有された情報を入力してください"
            }
          >
            {/* ユーザー情報の帯。Web はグラデーションの直下に白で置いている */}
            <View style={styles.userRow}>
              <View style={styles.userIcon}>
                <Ionicons name="person-outline" size={16} color={color.teal} />
              </View>
              <View>
                <Text style={styles.userName}>@{username || "未設定"}</Text>
                <Text style={styles.userRole}>{ROLE_LABEL[role] ?? role}</Text>
              </View>
            </View>
          </GradientHeaderCard>

          {joined ? (
            <View style={[styles.card, { alignItems: "center", gap: spacing.md }]}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.cardTitle}>組織への参加が完了しました</Text>
              <Text style={styles.lead}>
                集金担当者としてメンバー登録されました。ホームへ進んでください。
              </Text>
              <Button
                label="ホームへ"
                variant="gradient"
                icon="arrow-forward"
                onPress={() => router.replace("/")}
                style={{ alignSelf: "stretch", marginTop: spacing.sm }}
              />
            </View>
          ) : isAdmin ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Ionicons name="business-outline" size={18} color={color.teal} />
                <Text style={styles.cardTitle}>組織を作成する</Text>
              </View>
              <Text style={[styles.lead, { textAlign: "left", marginBottom: spacing.lg }]}>
                組織を作ると、店舗と集金データをチームで共有できます。後からスタッフを招待できます。
              </Text>

              <Field label="組織名（会社名・店舗グループ名など）">
                <Input
                  value={orgName}
                  onChangeText={setOrgName}
                  placeholder="例：山田コインランドリー"
                />
              </Field>

              {error && <View style={{ marginTop: spacing.lg }}><FormError message={error} /></View>}

              <Button
                label="組織を作成"
                variant="gradient"
                icon="add"
                loading={submitting}
                disabled={orgName.trim().length === 0}
                onPress={() =>
                  submit(
                    () => apiFetch("/org", { method: "POST", body: { name: orgName.trim() } }),
                    () => router.replace("/")
                  )
                }
                style={{ marginTop: spacing.xl }}
              />
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Ionicons name="business-outline" size={18} color={color.teal} />
                <Text style={styles.cardTitle}>組織に参加する</Text>
              </View>
              <Text style={[styles.lead, { textAlign: "left", marginBottom: spacing.lg }]}>
                管理者のメールアドレスと組織パスワードを入力してください。管理者から事前に共有を受けてください。
              </Text>

              <View style={{ gap: spacing.lg }}>
                <Field label="管理者のメールアドレス">
                  <Input
                    value={adminEmail}
                    onChangeText={setAdminEmail}
                    placeholder="admin@example.com"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                  />
                </Field>

                <Field label="組織パスワード">
                  <Input
                    value={joinPassword}
                    onChangeText={setJoinPassword}
                    placeholder="管理者から共有されたパスワード"
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </Field>

                {error && <FormError message={error} />}

                <Button
                  label="参加する"
                  variant="gradient"
                  icon="person-add-outline"
                  loading={submitting}
                  disabled={adminEmail.trim().length === 0 || joinPassword.trim().length === 0}
                  onPress={() =>
                    submit(
                      () =>
                        apiFetch("/org/join", {
                          method: "POST",
                          body: { adminEmail: adminEmail.trim(), password: joinPassword.trim() },
                        }),
                      () => setJoined(true)
                    )
                  }
                />
              </View>
            </View>
          )}

          {/*
            Web はここに OtherActionsCard（ヘルプ・規約・サインアウト）を置いているが、
            /terms・/help は価格とアップグレード導線を含むためアプリからは開けない
            （App Store Guideline 3.1.3(a)）。サインアウトのみ残す。
          */}
          <View style={styles.card}>
            <Button label="サインアウト" variant="ghost" onPress={async () => {
              await signOut();
              router.replace("/welcome");
            }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, justifyContent: "center", padding: spacing.lg, gap: spacing.lg },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  userIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.cyan100,
    alignItems: "center",
    justifyContent: "center",
  },
  userName: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain },
  userRole: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 1 },
  card: {
    backgroundColor: color.cardBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.lg,
    ...shadow.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  cardTitle: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
  lead: { fontFamily: font.ui, fontSize: 13, color: color.textMuted, lineHeight: 21, textAlign: "center" },
  successIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.teal,
    alignItems: "center",
    justifyContent: "center",
  },
});
