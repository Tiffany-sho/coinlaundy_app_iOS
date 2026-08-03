import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getNextCollectDate } from "@/shared/collectSchedule";
import type { CollectSchedule } from "@/api/types";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 次の集金日までのカウントダウン。Web の CollectCountdown.jsx を移植したもの。
 * ホームのヘッダーで**日付の右**に並べる。
 *
 * ⚠️ **幅は日付の残りしか無い**（およそ 150〜180pt）。行を増やさず 2 段に留めること。
 *    上段が日数、下段が集金予定（毎月◯日）。
 *
 * ⚠️ 以前は売上カードの下に横幅いっぱいのカードとして置いていたが、
 *    日付のすぐ隣に移した。**同じ数字を出すカードを画面内にもう 1 枚置かないこと。**
 *
 * 緊急度は色で分かるようにしてある（当日 = teal 塗り / 2 日以内 = オレンジ / それ以外 = teal 枠）。
 */
export function CollectCountdown({
  schedule,
}: {
  schedule: CollectSchedule | null | undefined;
}) {
  if (!schedule) return null;
  const next = getNextCollectDate(schedule);
  if (!next) return null;

  const { daysUntil } = next;
  const isToday = daysUntil === 0;
  const isSoon = daysUntil > 0 && daysUntil <= 2;

  const accent = isToday ? color.tealDeeper : isSoon ? color.orange500 : color.teal;
  const scheduleLabel =
    schedule.type === "weekly"
      ? `毎週${DAYS.filter((_, i) => schedule.days.includes(i)).join("・")}`
      : `毎月${[...schedule.days].sort((a, b) => a - b).join("・")}日`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isToday ? color.tealPale : color.cardBg,
          borderColor: isToday ? color.teal : isSoon ? color.orange200 : color.cyan100,
        },
      ]}
    >
      <View style={styles.headRow}>
        <Ionicons name="calendar" size={12} color={accent} />
        {isToday ? (
          <Text style={[styles.today, { color: accent }]}>今日が集金日</Text>
        ) : (
          <>
            <Text style={styles.lead}>集金まで</Text>
            <Text style={[styles.number, { color: accent }]}>{daysUntil}</Text>
            <Text style={[styles.unit, { color: accent }]}>日</Text>
          </>
        )}
      </View>
      <Text style={styles.schedule} numberOfLines={1}>
        {scheduleLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignItems: "flex-end",
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  lead: { fontFamily: font.ui, fontSize: 11, color: color.textMuted },
  /* 日数だけ numeric。1 桁と 2 桁で幅が動くと隣の日付まで揺れる */
  number: { ...numeric, fontSize: 17, lineHeight: 20 },
  unit: { fontFamily: font.uiBold, fontSize: 11 },
  today: { fontFamily: font.uiBold, fontSize: 13 },
  schedule: { fontFamily: font.ui, fontSize: 10, color: color.textFaint, marginTop: 1 },
});
