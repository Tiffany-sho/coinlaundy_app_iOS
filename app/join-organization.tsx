import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/api/client";
import {
  queryKeys,
  useBootstrap,
  useCancelJoinRequest,
  useMyJoinRequest,
} from "@/api/queries";
import { useAuth } from "@/auth/AuthProvider";
import { Button, GradientHeaderCard, Screen } from "@/components/common/ui";
import { Field, FormError, Input } from "@/components/common/form";
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
  const [orgName, setOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    自分が出している参加申請（013）。⚠️ **無いことは正常**（`null`）。
    ⚠️ **開いた時点で引く。** 引かないと、申請済みの人がこの画面を開き直すたびに
       空のフォームを見て、同じ申請を何度も送ろうとする（サーバは
       「すでに申請中です」で弾くので、エラーだけ見せることになる）。
  */
  const myRequest = useMyJoinRequest();
  const cancelRequest = useCancelJoinRequest();
  const pendingRequest = myRequest.data ?? null;

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

          {/*
            ⚠️ **申請しただけではまだ入れていない**（013、2026-08-06）。
               それまでは参加パスワードで**即座にメンバーになれた**ので
               「参加が完了しました」で正しかったが、今はオーナーの承認待ち。
               **「完了しました」に戻さないこと。** 入れたと誤解される。
            ⚠️ **役割を書かない。** 権限は承認する側が承認時に選ぶので、
               申請した時点ではまだ決まっていない。
          */}
          {pendingRequest ? (
            <View style={[styles.card, { alignItems: "center", gap: spacing.md }]}>
              <View style={styles.successIcon}>
                <Ionicons name="time-outline" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.cardTitle}>参加を申請しました</Text>
              <Text style={styles.lead}>
                {pendingRequest.orgName ? `「${pendingRequest.orgName}」の` : ""}
                オーナーが承認すると参加できます。承認されたら「確認する」を押してください。
              </Text>
              <Button
                label="確認する"
                variant="gradient"
                icon="refresh"
                onPress={() => router.replace("/")}
                style={{ alignSelf: "stretch", marginTop: spacing.sm }}
              />
              {/* ⚠️ 取り下げを必ず置く。別の組織へ申請し直す手段がこれしか無い */}
              <Button
                label="申請を取り下げる"
                variant="ghost"
                loading={cancelRequest.isPending}
                onPress={() =>
                  cancelRequest.mutate(undefined, {
                    onError: () => setError("申請を取り下げられませんでした"),
                  })
                }
                style={{ alignSelf: "stretch" }}
              />
            </View>
          ) : isAdmin ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Ionicons name="business-outline" size={18} color={color.teal} />
                <Text style={styles.cardTitle}>組織を作成する</Text>
              </View>
              <Text style={[styles.lead, { textAlign: "left", marginBottom: spacing.lg }]}>
                組織を作ると、店舗と集金データをチームで共有できます。スタッフからの参加申請を承認して追加できます。
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
                管理者のメールアドレスを入力して申請してください。組織のオーナーが承認すると参加できます。
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

                {error && <FormError message={error} />}

                <Button
                  label="参加を申請する"
                  variant="gradient"
                  icon="person-add-outline"
                  loading={submitting}
                  disabled={adminEmail.trim().length === 0}
                  onPress={() =>
                    submit(
                      () =>
                        apiFetch("/org/join", {
                          method: "POST",
                          body: { adminEmail: adminEmail.trim() },
                        }),
                      () => void myRequest.refetch()
                    )
                  }
                />
              </View>
            </View>
          )}

          {/*
            Web はここに OtherActionsCard（ヘルプ・規約・サインアウト）を置いているが、
            /terms・/help は価格とアップグレード導線を含むためアプリからは開けない
            （App Store Guideline 3.1.3(a)）。サインアウトと削除だけ残す。

            ⚠️ **アカウント削除をここに必ず置くこと**（Guideline 5.1.1(v)）。
               組織未所属のユーザーは `app/index.tsx` の振り分けでこの画面へ
               リダイレクトされ、**タブにもホームの歯車にも辿り着けない。**
               2026-08-05 まで削除の導線がこの画面に無く、**組織に入っていない
               集金担当者・閲覧者はアカウントを削除する手段が 1 つも無かった。**
               ⚠️ 設定画面（/settings）にあるから足りている、と考えないこと。
                  そこへ行けないのがこの画面の状態。
          */}
          <View style={[styles.card, { gap: spacing.md }]}>
            <Button label="サインアウト" variant="ghost" onPress={async () => {
              await signOut();
              router.replace("/welcome");
            }} />
            <Button
              label="アカウントを削除"
              variant="danger"
              onPress={() => router.push("/settings/delete-account")}
            />
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
