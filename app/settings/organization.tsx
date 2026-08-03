import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useBootstrap,
  useInvitations,
  useMembers,
  useRemoveMember,
  useStores,
  useUpdateMemberRole,
} from "@/api/queries";
import { CenterMessage, Muted, Screen } from "@/components/common/ui";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { INVITABLE_ROLES, ROLE_INFO, orgStyles } from "@/components/settings/orgShared";
import { OrgNameSection } from "@/components/settings/OrgNameSection";
import { ExpensesSection } from "@/components/settings/ExpensesSection";
import { expensesEnabled } from "@/components/expenses/expensesEnabled";
import { MemberRow } from "@/components/settings/MemberRow";
import { MemberStoreSheet } from "@/components/settings/MemberStoreSheet";
import { InviteSection, PendingInvitation } from "@/components/settings/InviteSection";
import { JoinPasswordCard } from "@/components/settings/JoinPasswordCard";
import { color, font, spacing } from "@/theme/tokens";
import type { OrgMember, Role } from "@/api/types";

/**
 * 組織管理。Web の /settings/organization/edit（OrganizationSettings + OrgJoinPasswordCard）を移植。
 *
 * 章立ても Web と同じ順に並べる：
 *   組織情報 → メンバー（N名） → メンバーを招待 → 保留中の招待 → 組織参加パスワード
 *
 * 各節は components/settings/ にある。ここは並べる順と、メンバーへの操作だけ。
 *
 * ⚠️ Web はこのページを admin 以外に見せない（page.jsx で /settings へ redirect）。
 *    アプリは戻る導線があるので画面自体は出すが、編集系は admin だけに出す。
 */
export default function Organization() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();

  const bootstrap = useBootstrap();
  const members = useMembers();
  const isAdmin = members.data?.myRole === "admin";
  const invitations = useInvitations(isAdmin);

  const currentUserId = bootstrap.data?.user.id;

  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  /*
    担当店舗の割り当てに使う店舗の一覧。
    ⚠️ **管理者から取るので全店舗が返る**（getStores は担当で絞るが admin は素通り）。
       管理者以外では取りに行かない — 使わないうえ、担当ぶんしか返らないので
       「割り当てられる店舗が足りない」ように見える。
  */
  const stores = useStores(isAdmin);
  /** 担当店舗シートを開いている相手。null で閉じる */
  const [assignTarget, setAssignTarget] = useState<OrgMember | null>(null);

  if (members.isLoading && !members.data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  if (members.error && !members.data) {
    return (
      <Screen>
        <CenterMessage text="メンバー情報を取得できませんでした" />
      </Screen>
    );
  }

  const list = members.data?.members ?? [];
  const pending = invitations.data ?? [];

  function onChangeRole(member: OrgMember) {
    void (async () => {
      const role = await dialog.choose<Role>({
        title: `${member.profiles.username ?? "メンバー"} の役割`,
        message: "変更する役割を選んでください",
        options: INVITABLE_ROLES.filter((r) => r !== member.role).map((r) => ({
          label: ROLE_INFO[r].label,
          value: r,
        })),
      });
      if (!role) return;
      const name = member.profiles.username ?? "メンバー";
      // ⚠️ ミューテーションには成功・失敗どちらのトーストも付ける（CLAUDE.md）。
      //    ここは長らく無く、押しても何も起きたように見えなかった
      updateRole.mutate(
        { userId: member.user_id, role },
        {
          onSuccess: () => toast.success(`${name} の役割を${ROLE_INFO[role].label}に変更しました`),
          onError: (e) =>
            toast.error(e instanceof Error ? e.message : "役割を変更できませんでした"),
        }
      );
    })();
  }

  function onRemove(member: OrgMember) {
    const name = member.profiles.username ?? "このメンバー";
    void (async () => {
      const ok = await dialog.confirm({
        title: `${name} をメンバーから削除しますか？`,
        message: "組織のデータを見られなくなります。",
        confirmLabel: "削除",
        destructive: true,
      });
      if (!ok) return;
      removeMember.mutate(member.user_id, {
        onSuccess: () => toast.success(`${name} を組織から削除しました`),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "メンバーを削除できませんでした"),
      });
    })();
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom + spacing.xxl,
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={orgStyles.headRow}>
            <Text style={styles.pageTitle}>組織管理</Text>
            <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
              <Ionicons name="chevron-back" size={16} color={color.textMuted} />
              <Text style={styles.backLabel}>戻る</Text>
            </Pressable>
          </View>

          <View style={orgStyles.card}>
            <OrgNameSection name={bootstrap.data?.organization?.name ?? ""} canEdit={isAdmin} />

            <View style={orgStyles.separator} />

            {/* ⚠️ 初期設定で聞いた「経費を記録するか」をここで変えられる（012）。
                   判定は必ず expensesEnabled() を通す（未指定＝使う） */}
            <ExpensesSection
              enabled={expensesEnabled(bootstrap.data?.organization)}
              canEdit={isAdmin}
            />

            <View style={orgStyles.separator} />

            <Text style={orgStyles.sectionTitle}>メンバー（{list.length}名）</Text>
            <View style={{ gap: spacing.sm }}>
              {list.length === 0 ? (
                <Muted>メンバーがいません</Muted>
              ) : (
                list.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isMe={member.user_id === currentUserId}
                    canEdit={isAdmin}
                    busy={
                      (updateRole.isPending && updateRole.variables?.userId === member.user_id) ||
                      (removeMember.isPending && removeMember.variables === member.user_id)
                    }
                    onChangeRole={() => onChangeRole(member)}
                    onRemove={() => onRemove(member)}
                    /* ⚠️ 管理者は常に全店舗（行を持たない）ので出さない。
                          出すと「未設定」に見え、保存すると 400 が返る */
                    onAssignStores={
                      isAdmin && member.role !== "admin"
                        ? () => setAssignTarget(member)
                        : undefined
                    }
                  />
                ))
              )}
            </View>

            {isAdmin && (
              <>
                <View style={orgStyles.separator} />
                <InviteSection />
              </>
            )}

            {isAdmin && pending.length > 0 && (
              <>
                <View style={orgStyles.separator} />
                <Text style={orgStyles.sectionTitle}>保留中の招待</Text>
                <View style={{ gap: spacing.sm }}>
                  {pending.map((inv) => (
                    <PendingInvitation
                      key={inv.id}
                      id={inv.id}
                      email={inv.email}
                      role={inv.role}
                      expiresAt={inv.expires_at}
                    />
                  ))}
                </View>
              </>
            )}
          </View>

          {isAdmin && <JoinPasswordCard />}

          {!isAdmin && <Muted>役割の変更・メンバーの削除・招待は店舗管理者のみ行えます。</Muted>}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ⚠️ ScrollView の外に置く。中に入れるとキーボードやスクロールに巻き込まれる */}
      <MemberStoreSheet
        member={assignTarget}
        stores={stores.data ?? []}
        onClose={() => setAssignTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pageTitle: { fontFamily: font.uiBold, fontSize: 20, color: color.tealDeeper },
  back: { flexDirection: "row", alignItems: "center", gap: 2 },
  backLabel: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
});
