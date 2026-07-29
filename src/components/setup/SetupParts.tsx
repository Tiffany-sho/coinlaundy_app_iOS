import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/common/ui";
import { color, font, radius, spacing } from "@/theme/tokens";

/** 初回セットアップの共通部品と、ステップをまたいで使うスタイル */

/**
 * ⚠️ 入れてよい値は "machines" / "total" の 2 つだけ。
 *    Web の useCollectMethod.js が `data.collectMethod === "machines"` で判定しているので、
 *    "machine" のような別表記を書き込むと Web 側が総額集金モードとして扱ってしまう。
 */
export type CollectMethod = "machines" | "total";
export type SetupRole = "admin" | "collecter";

/** 戻る / 次へ。全ステップの下端に置く */
export function StepNav({
  onBack,
  onNext,
  nextLabel = "次へ",
  loading,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  loading?: boolean;
}) {
  return (
    <View style={setupStyles.navRow}>
      <Button label="戻る" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
      <Button
        label={nextLabel}
        variant="gradient"
        onPress={onNext}
        loading={loading}
        style={{ flex: 1 }}
      />
    </View>
  );
}

/** 確認画面の 1 行 */
export function InfoItem({
  icon,
  label,
  value,
  badge,
  badgeTone = "cyan",
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  badge?: string;
  badgeTone?: "cyan" | "teal";
}) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={17} color={color.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || "未設定"}</Text>
      </View>
      {badge && (
        <View
          style={[
            styles.badge,
            { backgroundColor: badgeTone === "cyan" ? color.cyan100 : color.teal100 },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: badgeTone === "cyan" ? color.cyan800 : color.teal800 },
            ]}
          >
            {badge}
          </Text>
        </View>
      )}
    </View>
  );
}

/** 複数のステップから使うもの */
export const setupStyles = StyleSheet.create({
  lead: {
    fontFamily: font.ui,
    fontSize: 13,
    color: color.textMuted,
    lineHeight: 22,
    textAlign: "center",
  },
  navRow: { flexDirection: "row", gap: spacing.md },
  centerBlock: { alignItems: "center", gap: spacing.md },
  circleIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    backgroundColor: color.cyan50,
    alignItems: "center",
    justifyContent: "center",
  },
});

const styles = StyleSheet.create({
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: color.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.divider,
    padding: spacing.lg,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.cyan50,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginBottom: 2 },
  infoValue: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  badge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  badgeText: { fontFamily: font.uiBold, fontSize: 11 },
});
