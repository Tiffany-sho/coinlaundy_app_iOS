import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ROLE_INFO } from "@/components/settings/orgShared";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { OrgMember } from "@/api/types";

/**
 * メンバー 1 人。Web の MemberList の行に当たる。
 *
 * ⚠️ オーナー（admin）と自分自身は役割変更も削除もできない。Web と同じ条件。
 *    サーバ側でも弾かれるが、押せてしまうと「効かないボタン」になる。
 */
export function MemberRow({
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

const styles = StyleSheet.create({
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
});
