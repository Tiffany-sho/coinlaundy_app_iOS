import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { nowInJst } from "@/shared/date";
import { color, font, spacing } from "@/theme/tokens";

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];
/** 日曜は赤、土曜は青。それ以外は通常色（Web の DAY_COLOR と同じ） */
const DAY_COLOR: (string | null)[] = [color.red500, null, null, null, null, null, color.blue500];

function getGreeting(hour: number): string {
  if (hour < 11) return "おはようございます";
  if (hour < 17) return "こんにちは";
  return "こんばんは";
}

/** Web の GreetingHeader.jsx を移植 */
export function GreetingHeader({ username = "集金担当者" }: { username?: string }) {
  const today = nowInJst();
  const dayIndex = today.getDay();

  return (
    <View>
      <Text style={styles.greeting}>
        {getGreeting(today.getHours())}、{username}さん
      </Text>
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={14} color={color.teal} />
        <Text style={styles.date}>
          {today.getFullYear()}年{today.getMonth() + 1}月{today.getDate()}日
        </Text>
        <Text style={[styles.day, { color: DAY_COLOR[dayIndex] ?? color.textMuted }]}>
          （{DAYS[dayIndex]}）
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { fontFamily: font.uiBold, fontSize: 22, color: color.textMain, marginBottom: 4 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  date: { fontFamily: font.ui, fontSize: 14, color: color.textMuted },
  day: { fontFamily: font.uiBold, fontSize: 14 },
});
