import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatJstDate } from "@/shared/date";
import { color, font, radius, shadow, spacing, numeric } from "@/theme/tokens";

/** 集金詳細の上部。戻る・表題・オフラインの帯 */
export function FundDetailHeader({
  laundryName,
  savedDate,
  topInset,
  isOnline,
  onBack,
}: {
  laundryName: string | null;
  savedDate: number | null;
  topInset: number;
  isOnline: boolean;
  onBack: () => void;
}) {
  return (
    <>
      <View style={[styles.header, { paddingTop: topInset + spacing.sm }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {laundryName ? `${laundryName}店` : "集金データ"}
          </Text>
          <Text style={styles.headerSub}>
            {savedDate !== null ? formatJstDate(savedDate) : "集金の詳細"}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* ⚠️ 編集・削除は Outbox の対象外（対象は集金の新規登録だけ）。圏外では触らせない */}
      {!isOnline && (
        <View style={styles.offlineNote}>
          <Text style={styles.offlineNoteText}>
            オフライン — 電波が戻るまで編集・削除はできません
          </Text>
        </View>
      )}
    </>
  );
}

/** 失敗の理由。⚠️ 言い換えずサーバの日本語をそのまま出す（何を直せばいいか分からなくなる） */
export function FundErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Ionicons name="alert-circle" size={18} color={color.red500} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/** 押せない理由。⚠️ 黙ってボタンを伏せると現場で詰まるので必ず出す */
export function FundPermissionNote({ isViewer }: { isViewer: boolean }) {
  return (
    <View style={styles.noticeBox}>
      <Text style={styles.noticeText}>
        {isViewer
          ? "閲覧のみの権限のため、この集金データは編集・削除できません。"
          : "自分が登録した集金データ以外は、管理者のみが編集・削除できます。"}
      </Text>
    </View>
  );
}

/** 合計売上と台数。本家 MachineAndFundsList の上部ボックスと同じ組み方 */
export function FundTotalCard({ total, machineCount }: { total: number; machineCount: number }) {
  return (
    <View style={styles.totalCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.totalLabel}>合計売上</Text>
        <Text style={styles.totalValue}>¥{total.toLocaleString()}</Text>
      </View>
      {machineCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{machineCount}台</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: color.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
    ...shadow.sm,
  },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { textAlign: "center", fontFamily: font.uiBold, fontSize: 16, color: color.textMain },
  headerSub: {
    textAlign: "center",
    fontFamily: font.ui,
    fontSize: 11,
    color: color.textMuted,
    marginTop: 2,
  },
  offlineNote: {
    backgroundColor: color.orange500,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  offlineNoteText: { fontFamily: font.ui, fontSize: 12, color: "#FFFFFF", textAlign: "center" },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.red50,
    borderWidth: 1,
    borderColor: color.red400,
    borderRadius: radius.card - 6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { flex: 1, fontFamily: font.ui, fontSize: 13, color: "#991B1B" },
  noticeBox: {
    backgroundColor: color.gray50,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.card - 6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noticeText: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },

  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.cardBg,
    borderWidth: 1,
    borderColor: color.cyan100,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadow.sm,
  },
  totalLabel: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, marginBottom: 2 },
  totalValue: { ...numeric, fontSize: 30, color: color.textMain },
  badge: {
    backgroundColor: color.cyan100,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  badgeText: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
});
