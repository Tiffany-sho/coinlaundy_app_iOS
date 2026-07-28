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
import {
  useBootstrap,
  useDeleteInvitation,
  useInviteMember,
  useInvitations,
  useJoinPassword,
  useMembers,
  useRemoveMember,
  useSetJoinPassword,
  useUpdateMemberRole,
  useUpdateOrgName,
} from "@/api/queries";
import { Button, CenterMessage, Muted, Screen } from "@/components/ui";
import { Field, FormError, Input } from "@/components/form";
import { useDialog } from "@/components/dialog";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";
import type { OrgMember, Role } from "@/api/types";

/**
 * 組織管理。Web の /settings/organization/edit（OrganizationSettings + OrgJoinPasswordCard）を移植。
 *
 * 章立ても Web と同じ順に並べる：
 *   組織情報 → メンバー（N名） → メンバーを招待 → 保留中の招待 → 組織参加パスワード
 *
 * ⚠️ Web はこのページを admin 以外に見せない（page.jsx で /settings へ redirect）。
 *    アプリは戻る導線があるので画面自体は出すが、編集系は admin だけに出す。
 */

/** Web の MemberList の ROLE_INFO と同じ表記・同じ配色 */
const ROLE_INFO: Record<Role, { label: string; bg: string; fg: string }> = {
  admin: { label: "店舗管理者", bg: color.tealPale, fg: color.tealDeeper },
  collecter: { label: "集金担当者", bg: color.cyan100, fg: color.tealDeeper },
  viewer: { label: "閲覧者", bg: color.gray100, fg: color.gray700 },
};

/** 招待できるのは集金担当者と閲覧者だけ（Web の inviteMember が admin を拒否する） */
const INVITABLE_ROLES: Role[] = ["collecter", "viewer"];

export default function Organization() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();

  const bootstrap = useBootstrap();
  const members = useMembers();
  const isAdmin = members.data?.myRole === "admin";
  const invitations = useInvitations(isAdmin);

  const currentUserId = bootstrap.data?.user.id;
  const currentUsername =
    bootstrap.data?.profile?.username ?? bootstrap.data?.profile?.full_name ?? "オーナー";

  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

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
      if (role) updateRole.mutate({ userId: member.user_id, role });
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
      if (ok) removeMember.mutate(member.user_id);
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
          <View style={styles.headRow}>
            <Text style={styles.pageTitle}>組織管理</Text>
            <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
              <Ionicons name="chevron-back" size={16} color={color.textMuted} />
              <Text style={styles.backLabel}>戻る</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <OrgNameSection
              name={bootstrap.data?.organization?.name ?? ""}
              canEdit={isAdmin}
            />

            <View style={styles.separator} />

            <Text style={styles.sectionTitle}>メンバー（{list.length}名）</Text>
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
                  />
                ))
              )}
            </View>

            {isAdmin && (
              <>
                <View style={styles.separator} />
                <InviteSection orgName={bootstrap.data?.organization?.name ?? ""} inviterName={currentUsername} />
              </>
            )}

            {isAdmin && pending.length > 0 && (
              <>
                <View style={styles.separator} />
                <Text style={styles.sectionTitle}>保留中の招待</Text>
                <View style={{ gap: spacing.sm }}>
                  {pending.map((inv) => (
                    <PendingInvitation key={inv.id} id={inv.id} email={inv.email} role={inv.role} expiresAt={inv.expires_at} />
                  ))}
                </View>
              </>
            )}
          </View>

          {isAdmin && <JoinPasswordCard />}

          {!isAdmin && (
            <Muted>役割の変更・メンバーの削除・招待は店舗管理者のみ行えます。</Muted>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ─── 組織情報 ────────────────────────────────────────────────

function OrgNameSection({ name, canEdit }: { name: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const update = useUpdateOrgName();

  // 別画面で名前が変わったときに編集中でない入力欄を追従させる
  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  return (
    <View>
      <Text style={styles.sectionTitle}>組織情報</Text>
      <View style={styles.orgBox}>
        {editing ? (
          <View style={{ gap: spacing.md }}>
            <Input value={value} onChangeText={setValue} autoFocus placeholder="組織名" />
            {update.error && <FormError message={errorText(update.error, "組織名を更新できませんでした")} />}
            <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" }}>
              <Button
                label="キャンセル"
                variant="ghost"
                onPress={() => {
                  setValue(name);
                  update.reset();
                  setEditing(false);
                }}
              />
              <Button
                label="保存"
                variant="gradient"
                loading={update.isPending}
                disabled={value.trim().length === 0}
                onPress={() =>
                  update.mutate(value.trim(), { onSuccess: () => setEditing(false) })
                }
              />
            </View>
          </View>
        ) : (
          <View style={styles.orgRow}>
            <Text style={styles.orgName}>{name || "未設定"}</Text>
            {canEdit && (
              <Pressable onPress={() => setEditing(true)} hitSlop={10} style={styles.editLink}>
                <Ionicons name="pencil" size={13} color={color.teal} />
                <Text style={styles.editLabel}>編集</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── メンバー ────────────────────────────────────────────────

function MemberRow({
  member,
  isMe,
  canEdit,
  busy,
  onChangeRole,
  onRemove,
}: {
  member: OrgMember;
  isMe: boolean;
  canEdit: boolean;
  busy: boolean;
  onChangeRole: () => void;
  onRemove: () => void;
}) {
  const info = ROLE_INFO[member.role] ?? ROLE_INFO.viewer;
  const isOwner = member.role === "admin";
  // オーナーと自分自身は役割変更も削除もできない（Web と同じ）
  const mutable = canEdit && !isOwner && !isMe;

  return (
    <View style={styles.memberCard}>
      <View style={styles.memberAvatar}>
        <Ionicons name="person-outline" size={16} color={color.teal} />
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.memberNameRow}>
          <Text style={styles.memberName}>
            {member.profiles.username || member.profiles.full_name || "ユーザー"}
          </Text>
          {isMe && (
            <View style={styles.meBadge}>
              <Text style={styles.meBadgeText}>あなた</Text>
            </View>
          )}
        </View>
        {member.profiles.full_name ? (
          <Text style={styles.memberSub}>{member.profiles.full_name}</Text>
        ) : null}
      </View>

      {mutable ? (
        <Pressable onPress={onChangeRole} disabled={busy} style={styles.rolePicker} hitSlop={6}>
          <Text style={styles.rolePickerText}>{info.label}</Text>
          <Ionicons name="chevron-down" size={13} color={color.textMuted} />
        </Pressable>
      ) : (
        <View style={[styles.roleBadge, { backgroundColor: info.bg }]}>
          <Text style={[styles.roleBadgeText, { color: info.fg }]}>{info.label}</Text>
        </View>
      )}

      {mutable && (
        <Pressable onPress={onRemove} disabled={busy} style={styles.trash} hitSlop={6}>
          <Ionicons name="trash-outline" size={16} color={color.red400} />
        </Pressable>
      )}
    </View>
  );
}

// ─── 招待 ────────────────────────────────────────────────────

function InviteSection({ orgName, inviterName }: { orgName: string; inviterName: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("collecter");
  const [notice, setNotice] = useState<string | null>(null);
  const invite = useInviteMember();

  function onInvite() {
    setNotice(null);
    invite.mutate(
      { email: email.trim(), role },
      {
        onSuccess: (result) => {
          setEmail("");
          setNotice(
            result.emailSent
              ? `${email.trim()} に招待メールを送信しました`
              : "招待を作成しましたが、メールを送信できませんでした。相手に直接連絡してください。"
          );
        },
      }
    );
  }

  return (
    <View style={styles.inviteBox}>
      <Text style={styles.inviteTitle}>メンバーを招待</Text>
      <View style={{ gap: spacing.md }}>
        <Field label="メールアドレス">
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="example@email.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
        </Field>

        <Field label="役割">
          <View style={styles.roleChoices}>
            {INVITABLE_ROLES.map((r) => {
              const selected = r === role;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  style={[styles.roleChoice, selected && styles.roleChoiceSelected]}
                >
                  <Text style={[styles.roleChoiceText, selected && { color: color.cyan900 }]}>
                    {ROLE_INFO[r].label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {/*
          Web は「Collecie に未登録のメールアドレスは招待できない」を
          サーバ側で弾いてエラー文言を返す。そのまま出す。
        */}
        {invite.error && <FormError message={errorText(invite.error, "招待に失敗しました")} />}
        {notice && <Text style={styles.notice}>{notice}</Text>}

        <Button
          label="招待メールを送信"
          variant="gradient"
          icon="mail-outline"
          loading={invite.isPending}
          disabled={email.trim().length === 0}
          onPress={onInvite}
        />
      </View>
    </View>
  );
}

function PendingInvitation({
  id,
  email,
  role,
  expiresAt,
}: {
  id: string;
  email: string;
  role: Role;
  expiresAt: string | null;
}) {
  const remove = useDeleteInvitation();
  const dialog = useDialog();

  return (
    <View style={styles.pendingCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pendingEmail}>{email}</Text>
        <View style={styles.pendingMeta}>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{ROLE_INFO[role]?.label ?? role}</Text>
          </View>
          {expiresAt && (
            <Text style={styles.pendingExpiry}>
              {new Date(expiresAt).toLocaleDateString("ja-JP")} 期限
            </Text>
          )}
        </View>
      </View>
      <Pressable
        onPress={() =>
          void (async () => {
            const ok = await dialog.confirm({
              title: "招待を取り消しますか？",
              message: email,
              confirmLabel: "取り消す",
              cancelLabel: "やめる",
              destructive: true,
            });
            if (ok) remove.mutate(id);
          })()
        }
        disabled={remove.isPending}
        hitSlop={8}
        style={styles.cancelInvite}
      >
        <Ionicons name="close" size={14} color={color.red400} />
        <Text style={styles.cancelInviteText}>取り消し</Text>
      </Pressable>
    </View>
  );
}

// ─── 組織参加パスワード ──────────────────────────────────────

function JoinPasswordCard() {
  const { data, isLoading } = useJoinPassword();
  const save = useSetJoinPassword();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  const hasPassword = Boolean(data);

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <View style={styles.cardHead}>
          <Ionicons name="key-outline" size={16} color={color.teal} />
          <Text style={styles.sectionTitle}>組織参加パスワード</Text>
        </View>
        {!editing && (
          <Pressable
            onPress={() => {
              setValue(data ?? "");
              setSaved(false);
              setEditing(true);
            }}
            hitSlop={10}
            style={styles.editLink}
          >
            <Ionicons name="pencil" size={13} color={color.teal} />
            <Text style={styles.editLabel}>{hasPassword ? "変更" : "設定"}</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.lead}>
        このパスワードを共有したユーザーが組織に参加できます。未設定の場合は参加リクエストを受け付けません。
      </Text>

      {!editing ? (
        <View style={styles.passwordBox}>
          <Ionicons name="eye-off-outline" size={14} color={color.textFaint} />
          <Text style={[styles.passwordText, !hasPassword && { color: color.textFaint }]}>
            {isLoading ? "…" : hasPassword ? "••••••••" : "未設定"}
          </Text>
          {saved && (
            <View style={styles.savedRow}>
              <Ionicons name="checkmark" size={13} color={color.teal} />
              <Text style={styles.savedText}>保存済み</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <Input value={value} onChangeText={setValue} placeholder="例: laundry2024" autoFocus autoCapitalize="none" />
          <Text style={styles.hint}>空欄で保存すると参加パスワードを削除します。</Text>
          {save.error && <FormError message={errorText(save.error, "保存に失敗しました")} />}
          <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" }}>
            <Button
              label="キャンセル"
              variant="ghost"
              onPress={() => {
                save.reset();
                setEditing(false);
              }}
            />
            <Button
              label="保存"
              variant="gradient"
              loading={save.isPending}
              onPress={() =>
                save.mutate(value.trim(), {
                  onSuccess: () => {
                    setEditing(false);
                    setSaved(true);
                  },
                })
              }
            />
          </View>
        </View>
      )}
    </View>
  );
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pageTitle: { fontFamily: font.uiBold, fontSize: 20, color: color.tealDeeper },
  back: { flexDirection: "row", alignItems: "center", gap: 2 },
  backLabel: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
  card: {
    backgroundColor: color.cardBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper, marginBottom: spacing.md },
  separator: { height: 1, backgroundColor: color.divider, marginVertical: spacing.md },
  lead: { fontFamily: font.ui, fontSize: 13, color: color.textMuted, lineHeight: 20 },
  hint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint },

  orgBox: {
    backgroundColor: color.tealPale,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.lg,
  },
  orgRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orgName: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper, flex: 1 },
  editLink: { flexDirection: "row", alignItems: "center", gap: 3 },
  editLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.teal },

  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: color.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.md,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.tealPale,
    alignItems: "center",
    justifyContent: "center",
  },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  memberName: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  memberSub: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 1 },
  meBadge: {
    backgroundColor: color.cyan100,
    borderRadius: radius.md,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  meBadgeText: { fontFamily: font.uiBold, fontSize: 10, color: color.tealDeeper },
  roleBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  roleBadgeText: { fontFamily: font.uiBold, fontSize: 11 },
  rolePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  rolePickerText: { fontFamily: font.ui, fontSize: 11, color: color.textMain },
  trash: { padding: 4 },

  inviteBox: {
    backgroundColor: color.tealPale,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.lg,
  },
  inviteTitle: {
    fontFamily: font.uiBold,
    fontSize: 14,
    color: color.tealDeeper,
    marginBottom: spacing.lg,
  },
  roleChoices: { flexDirection: "row", gap: spacing.sm },
  roleChoice: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.cardBg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: color.divider,
  },
  roleChoiceSelected: { borderColor: color.cyan400, backgroundColor: color.cyan50 },
  roleChoiceText: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain },
  notice: { fontFamily: font.ui, fontSize: 12, color: color.tealDeeper, lineHeight: 18 },

  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: color.yellow50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.yellow200,
    padding: spacing.md,
  },
  pendingEmail: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain },
  pendingMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 3 },
  pendingBadge: {
    backgroundColor: color.yellow200,
    borderRadius: radius.md,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  pendingBadgeText: { fontFamily: font.uiBold, fontSize: 10, color: color.yellow800 },
  pendingExpiry: { fontFamily: font.ui, fontSize: 10, color: color.textFaint },
  cancelInvite: { flexDirection: "row", alignItems: "center", gap: 2, padding: 4 },
  cancelInviteText: { fontFamily: font.uiBold, fontSize: 11, color: color.red400 },

  passwordBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.appBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  passwordText: { fontFamily: font.ui, fontSize: 14, color: color.textMain },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto" },
  savedText: { fontFamily: font.uiBold, fontSize: 11, color: color.teal },
});
