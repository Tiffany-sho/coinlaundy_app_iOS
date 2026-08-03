import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getNextCollectDate } from "@/shared/collectSchedule";
import type { CollectSchedule } from "@/api/types";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 次の集金日までのカウントダウン。Web の CollectCountdown.jsx を移植したもの。
 * ホームのヘッダーの下に**横幅いっぱいのカード**として置く。
 *
 * ⚠️ **日付の右に戻さない**（2026-08-03）。一度そうしていたが、
 *    **幅が日付の残り 150〜180pt しか無く、小さすぎて気づかれなかった。**
 *    集金を促すのがこのカードの役目なので、**見落とされたら意味が無い。**
 *
 * ⚠️ **同じ数字を出すカードを画面内にもう 1 枚置かないこと。**
 *    集金予定（毎月◯日）もこのカードが右側に持っている。
 *
 * ⚠️ **`schedule` が無いときは何も描かない。** 集金日を「設定しない」に
 *    できるので（`PUT /org/collect-schedule` に `{ schedule: null }`）、
 *    そのとき 0 日や「未設定」と出すと、設定した人と区別が付かなくなる。
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
      {/* ⚠️ 左は shrink させる。集金日を多く設定すると右のラベルが長くなる */}
      <View style={styles.left}>
        <View style={[styles.icon, { backgroundColor: isToday ? color.teal : color.cyan50 }]}>
          <Ionicons name="calendar" size={16} color={isToday ? "#FFFFFF" : accent} />
        </View>
        {isToday ? (
          <Text style={[styles.today, { color: accent }]}>今日が集金日です</Text>
        ) : (
          <View style={styles.countRow}>
            <Text style={styles.lead}>集金まで</Text>
            <Text style={[styles.number, { color: accent }]}>{daysUntil}</Text>
            <Text style={[styles.unit, { color: accent }]}>日</Text>
          </View>
        )}
      </View>

      {/* ⚠️ 右端に予定を出す。カードが 1 行になるので、無いと「何の予定か」が分からない */}
      <Text style={styles.schedule} numberOfLines={1}>
        {scheduleLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ⚠️ 横幅いっぱい。小さくすると気づかれない（日付の右に置いていた頃の反省） */
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  left: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  icon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  countRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  lead: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
  /* ⚠️ 日数は numeric を丸ごと展開する。1 桁と 2 桁で幅が動くと押すたびに揺れる */
  number: { ...numeric, fontSize: 22 },
  unit: { fontFamily: font.uiBold, fontSize: 13 },
  today: { fontFamily: font.uiBold, fontSize: 15 },
  schedule: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, flexShrink: 0 },
});
