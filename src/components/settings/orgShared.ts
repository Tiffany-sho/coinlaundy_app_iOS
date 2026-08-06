import { StyleSheet } from "react-native";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";
import type { Role } from "@/api/types";

/** 組織管理の画面で共有する定数とスタイル */

/** Web の MemberList の ROLE_INFO と同じ表記・同じ配色 */
export const ROLE_INFO: Record<Role, { label: string; bg: string; fg: string }> = {
  admin: { label: "店舗管理者", bg: color.tealPale, fg: color.tealDeeper },
  collecter: { label: "集金担当者", bg: color.cyan100, fg: color.tealDeeper },
  viewer: { label: "閲覧者", bg: color.gray100, fg: color.gray700 },
};

/**
 * 割り当てられる権限。**メンバーの権限変更と、参加申請の承認（013）で使う。**
 * ⚠️ **`admin` を入れないこと。** オーナーの座を配れてしまう。
 */
export const ASSIGNABLE_ROLES: Role[] = ["collecter", "viewer"];

/** ⚠️ サーバが返した日本語をそのまま出す。言い換えると何を直せばいいか分からなくなる */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** カード・見出し・編集リンクなど、複数の節で使い回すもの */
export const orgStyles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  sectionTitle: {
    fontFamily: font.uiBold,
    fontSize: 15,
    color: color.tealDeeper,
    marginBottom: spacing.md,
  },
  separator: { height: 1, backgroundColor: color.divider, marginVertical: spacing.md },
  lead: { fontFamily: font.ui, fontSize: 13, color: color.textMuted, lineHeight: 20 },
  hint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint },
  editLink: { flexDirection: "row", alignItems: "center", gap: 3 },
  editLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.teal },
  formActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
});
