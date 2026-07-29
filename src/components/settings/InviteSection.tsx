import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDeleteInvitation, useInviteMember } from "@/api/queries";
import { Button } from "@/components/common/ui";
import { Field, FormError, Input } from "@/components/common/form";
import { useDialog } from "@/components/common/dialog";
import { errorText, INVITABLE_ROLES, ROLE_INFO } from "@/components/settings/orgShared";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { Role } from "@/api/types";

/** メンバーの招待。Web の OrganizationSettings の招待フォーム */
export function InviteSection() {
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
          const sentTo = email.trim();
          setEmail("");
          // ⚠️ 招待そのものは作れてメールだけ失敗することがある。成功と一括りにしない
          setNotice(
            result.emailSent
              ? `${sentTo} に招待メールを送信しました`
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
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
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

        {/* Web は「Collecie に未登録のメールアドレスは招待できない」をサーバ側で弾く。文言はそのまま出す */}
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

/** 保留中の招待 1 件 */
export function PendingInvitation({
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

  async function onCancel() {
    const ok = await dialog.confirm({
      title: "招待を取り消しますか？",
      message: email,
      confirmLabel: "取り消す",
      cancelLabel: "やめる",
      destructive: true,
    });
    if (ok) remove.mutate(id);
  }

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
        onPress={() => void onCancel()}
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

const styles = StyleSheet.create({
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
});
