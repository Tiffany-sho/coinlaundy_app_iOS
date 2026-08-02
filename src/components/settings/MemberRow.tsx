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
  onAssignStores,
}: {
  member: OrgMember;
  isMe: boolean;
  canEdit: boolean;
  busy: boolean;
  onChangeRole: () => void;
  onRemove: () => void;
  /**
   * 担当店舗を割り当てる（011）。
   * ⚠️ **渡さなければ行ごと出ない。** 管理者以外が見ているときと、
   *    相手が管理者（＝常に全店舗で行を持たない）のときは渡さないこと。
   */
  onAssignStores?: () => void;
}) {
  const info = ROLE_INFO[member.role] ?? ROLE_INFO.viewer;
  const isOwner = member.role === "admin";
  const mutable = canEdit && !isOwner && !isMe;

  const assignedCount = (member.storeIds ?? []).length;

  return (
    <View style={styles.memberCard}>
      <View style={styles.memberTop}>
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

      {onAssignStores && (
        <Pressable
          onPress={onAssignStores}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="担当店舗を変更する"
          style={({ pressed }) => [styles.assignRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="business-outline" size={13} color={color.teal} />
          <Text style={styles.assignLabel}>担当店舗</Text>
          {/* ⚠️ 0 件は目立たせる。この人は集金も在庫も何も見えない状態 */}
          <Text style={[styles.assignValue, assignedCount === 0 && styles.assignValueEmpty]}>
            {assignedCount === 0 ? "未設定（何も見えません）" : `${assignedCount}店舗`}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={color.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  memberCard: {
    backgroundColor: color.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.md,
  },
  /* ⚠️ 上段は元どおり横並び。カード側を縦積みに変えたので、ここで受け直す */
  memberTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  assignLabel: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  assignValue: {
    flex: 1,
    fontFamily: font.uiBold,
    fontSize: 12,
    color: color.tealDeeper,
    textAlign: "right",
  },
  assignValueEmpty: { color: color.orange500 },
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
