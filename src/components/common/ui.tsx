import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  buttonGradient,
  color,
  font,
  heroGradient,
  MONTH_GRADIENT,
  numeric,
  radius,
  shadow,
  spacing,
  HIT_SIZE,
} from "@/theme/tokens";

/**
 * カード。Web は影だけでなく `1px solid cyan.100` の枠線を必ず持つ。
 * 枠線を省くと全体がのっぺりして本家と印象が変わるので外さないこと。
 */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * リスト用のコンテナ。Web は「見出し行 + 区切り線で区切られた行」を
 * 1 枚のカードに収める形（RecentCollectList.jsx）。行ごとにカードを分けない。
 */
export function ListCard({
  icon,
  title,
  actionLabel,
  onAction,
  children,
  style,
}: {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, styles.listCard, style]}>
      <View style={styles.listHeader}>
        <View style={styles.listHeaderLeft}>
          {icon && <Ionicons name={icon} size={15} color={color.teal} />}
          <Text style={styles.listTitle}>{title}</Text>
        </View>
        {actionLabel && onAction && (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.listAction}>{actionLabel} →</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

/** ListCard の中の 1 行。最後の行だけ区切り線を消す */
export function ListRow({
  children,
  last,
  onPress,
}: {
  children: React.ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  const content = <View style={[styles.listRow, last && { borderBottomWidth: 0 }]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {content}
    </Pressable>
  );
}

/** ListCard 内の「データなし」表示 */
export function ListEmpty({ text }: { text: string }) {
  return (
    <View style={styles.listEmpty}>
      <Text style={styles.mutedCentered}>{text}</Text>
    </View>
  );
}

/** セクション見出し。Web は各ブロックの上に置いている */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeading}>{children}</Text>;
}

/**
 * ヒーローカード。配色は月ごとに変わる（Web の MONTH_GRADIENT と同じ）。
 * 7 月なら teal 系、12 月なら青系、というように現場が月を色で認識できるようにしている。
 */
export function HeroCard({
  month,
  children,
}: {
  month: number;
  children: React.ReactNode;
}) {
  const colors = MONTH_GRADIENT[month] ?? MONTH_GRADIENT[7];
  return (
    <LinearGradient
      colors={colors}
      locations={[0, 0.55, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      {children}
    </LinearGradient>
  );
}

/**
 * 金額表示。
 *
 * ⚠️ Web が「¥ を小さく、数字を大きく」と分けて組んでいるのは**ヒーローカードだけ**。
 *    総売上・履歴・集計などは `¥{n.toLocaleString()}` の 1 文字列で出している。
 *    分割すると ¥ のベースラインがずれて数字と揃わないので、既定は 1 文字列にする。
 *    ヒーローで使う場合だけ splitSymbol を立てること。
 */
export function MoneyText({
  value,
  size = 28,
  tone = "main",
  splitSymbol = false,
}: {
  value: number | null | undefined;
  size?: number;
  tone?: "main" | "onHero" | "deeper";
  splitSymbol?: boolean;
}) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const textColor =
    tone === "onHero" ? "#FFFFFF" : tone === "deeper" ? color.tealDeeper : color.textMain;

  if (!splitSymbol) {
    return (
      <Text style={{ ...numeric, fontSize: size, color: textColor }}>
        ¥{amount.toLocaleString()}
      </Text>
    );
  }

  return (
    <View style={styles.moneyRow}>
      <Text
        style={{
          ...numeric,
          fontSize: Math.round(size * 0.55),
          lineHeight: size,
          color: textColor,
        }}
      >
        ¥
      </Text>
      <Text style={{ ...numeric, fontSize: size, lineHeight: size, color: textColor }}>
        {amount.toLocaleString()}
      </Text>
    </View>
  );
}

/**
 * ヘッダーがグラデーションのカード。Web のログイン（AuthForm）と組織参加
 * （JoinOrganizationHome）が同じ組み方をしている：teal のヘッダー + 白い本体。
 */
export function GradientHeaderCard({
  icon,
  title,
  subtitle,
  children,
  style,
}: {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.gradientCard, style]}>
      <LinearGradient
        colors={heroGradient.colors}
        locations={heroGradient.locations}
        start={heroGradient.start}
        end={heroGradient.end}
        style={styles.gradientHead}
      >
        {icon && (
          <View style={styles.gradientIcon}>
            <Ionicons name={icon} size={32} color="#FFFFFF" />
          </View>
        )}
        <Text style={styles.gradientTitle}>{title}</Text>
        {subtitle && <Text style={styles.gradientSubtitle}>{subtitle}</Text>}
      </LinearGradient>
      {children && <View style={styles.gradientBody}>{children}</View>}
    </View>
  );
}

/**
 * ボタン。
 * ⚠️ Web の主ボタンは単色ではなく linear-gradient(135deg, #0891B2, #0E7490)。
 *    「次へ」「登録」「参加する」など前に進む操作は gradient を使うこと。
 *    primary（単色 teal）はタブ内の副次的な操作に残してある。
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "gradient" | "ghost" | "danger";
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const onFill = variant === "primary" || variant === "gradient";

  const content = loading ? (
    <ActivityIndicator color={onFill ? "#FFFFFF" : color.teal} />
  ) : (
    <View style={styles.buttonInner}>
      {icon && (
        <Ionicons
          name={icon}
          size={17}
          color={
            onFill ? "#FFFFFF" : variant === "danger" ? color.red500 : color.textMuted
          }
        />
      )}
      <Text
        style={[
          styles.buttonLabel,
          onFill && styles.buttonLabelPrimary,
          variant === "ghost" && styles.buttonLabelGhost,
          variant === "danger" && styles.buttonLabelDanger,
        ]}
      >
        {label}
      </Text>
    </View>
  );

  if (variant === "gradient") {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.buttonShadow,
          pressed && !isDisabled && styles.buttonPressed,
          isDisabled && styles.buttonDisabled,
          style,
        ]}
      >
        <LinearGradient
          colors={buttonGradient.colors}
          start={buttonGradient.start}
          end={buttonGradient.end}
          style={[styles.button, styles.buttonFill]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "ghost" && styles.buttonGhost,
        variant === "danger" && styles.buttonDanger,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function CenterMessage({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.mutedCentered}>{text}</Text>
    </View>
  );
}

export function OfflineBanner({ lastUpdated }: { lastUpdated?: string }) {
  return (
    <View style={styles.offline}>
      <Text style={styles.offlineText}>
        オフライン{lastUpdated ? ` — 最終更新 ${lastUpdated}` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.appBg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: {
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    ...shadow.sm,
  },
  listCard: { padding: 0, overflow: "hidden" },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  listHeaderLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  listTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
  listAction: { fontFamily: font.ui, fontSize: 12, color: color.teal },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  listEmpty: { paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, alignItems: "center" },
  sectionHeading: {
    fontFamily: font.uiBold,
    fontSize: 17,
    color: color.textMain,
    marginBottom: spacing.md,
  },
  hero: {
    borderRadius: radius.card,
    padding: spacing.xl,
    ...shadow.hero,
  },
  moneyRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  title: { fontFamily: font.uiBold, fontSize: 18, color: color.tealDeeper },
  muted: { fontFamily: font.ui, fontSize: 14, color: color.textMuted },
  mutedCentered: { fontFamily: font.ui, fontSize: 14, color: color.textMuted, textAlign: "center" },
  gradientCard: {
    borderRadius: radius.card,
    overflow: "hidden",
    ...shadow.hero,
  },
  gradientHead: { paddingVertical: spacing.xl, paddingHorizontal: spacing.xl, alignItems: "center" },
  gradientIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  gradientTitle: { fontFamily: font.uiBold, fontSize: 20, color: "#FFFFFF", textAlign: "center" },
  gradientSubtitle: {
    fontFamily: font.ui,
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    marginTop: spacing.xs,
  },
  gradientBody: { backgroundColor: color.cardBg, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  button: {
    minHeight: HIT_SIZE,
    borderRadius: radius.card - 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  buttonFill: { width: "100%" },
  buttonShadow: {
    borderRadius: radius.card - 6,
    shadowColor: "#0891B2",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonPrimary: { backgroundColor: color.teal },
  buttonGhost: { backgroundColor: color.cardBg, borderWidth: 1, borderColor: color.divider },
  buttonDanger: { backgroundColor: color.cardBg, borderWidth: 2, borderColor: color.red400 },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { fontFamily: font.uiBold, fontSize: 15 },
  buttonLabelPrimary: { color: "#FFFFFF" },
  buttonLabelGhost: { color: color.textMuted },
  buttonLabelDanger: { color: color.red500 },
  offline: { backgroundColor: color.orange500, paddingVertical: 6, paddingHorizontal: spacing.lg },
  offlineText: { fontFamily: font.ui, fontSize: 12, color: "#FFFFFF", textAlign: "center" },
});
