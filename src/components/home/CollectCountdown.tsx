import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { getNextCollectDate } from "@/shared/collectSchedule";
import type { CollectSchedule } from "@/api/types";
import { color, font, radius, shadow, spacing, numeric } from "@/theme/tokens";

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * Web の CollectCountdown.jsx を移植。
 * 当日はグラデーション、2 日以内はオレンジ、それ以外は teal と、
 * 緊急度が色で分かるようにしている。
 */
export function CollectCountdown({ schedule }: { schedule: CollectSchedule | null | undefined }) {
  if (!schedule) return null;
  const next = getNextCollectDate(schedule);
  if (!next) return null;

  const { daysUntil } = next;
  const isToday = daysUntil === 0;
  const isSoon = daysUntil > 0 && daysUntil <= 2;

  const label =
    daysUntil === 0
      ? "今日は集金日です！"
      : daysUntil === 1
        ? "明日が集金日です"
        : `次の集金まで ${daysUntil} 日`;

  const scheduleLabel =
    schedule.type === "weekly"
      ? `毎週 ${DAYS.filter((_, i) => schedule.days.includes(i)).join("・")}曜日`
      : `毎月 ${[...schedule.days].sort((a, b) => a - b).join("・")}日`;

  const textColor = isToday ? "#FFFFFF" : isSoon ? color.orange500 : color.teal;

  const body = (
    <View style={styles.row}>
      <View
        style={[
          styles.iconBox,
          { backgroundColor: isToday ? "rgba(255,255,255,0.2)" : color.tealPale },
        ]}
      >
        <Ionicons name="calendar" size={20} color={isToday ? "#FFFFFF" : color.teal} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        <Text
          style={[
            styles.schedule,
            { color: isToday ? "rgba(255,255,255,0.75)" : color.textMuted },
          ]}
        >
          {scheduleLabel}
        </Text>
      </View>

      {daysUntil > 0 && (
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.number, { color: textColor }]}>{daysUntil}</Text>
          <Text style={styles.unit}>日</Text>
        </View>
      )}
    </View>
  );

  if (isToday) {
    return (
      <LinearGradient
        colors={["#0E7490", "#0891B2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: "transparent" }]}
      >
        {body}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: color.cardBg, borderColor: isSoon ? color.orange200 : color.cyan100 },
      ]}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadow.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: font.uiBold, fontSize: 15 },
  schedule: { fontFamily: font.ui, fontSize: 12, marginTop: 2 },
  number: { ...numeric, fontSize: 26, lineHeight: 30 },
  unit: { fontFamily: font.ui, fontSize: 11, color: color.textMuted },
});
