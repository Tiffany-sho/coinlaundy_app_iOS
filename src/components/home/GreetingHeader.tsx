import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CollectCountdown } from "@/components/home/CollectCountdown";
import { nowInJst } from "@/shared/date";
import type { CollectSchedule } from "@/api/types";
import { color, font, spacing } from "@/theme/tokens";

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];
/** 日曜は赤、土曜は青。それ以外は通常色（Web の DAY_COLOR と同じ） */
const DAY_COLOR: (string | null)[] = [color.red500, null, null, null, null, null, color.blue500];

function getGreeting(hour: number): string {
  if (hour < 11) return "おはようございます";
  if (hour < 17) return "こんにちは";
  return "こんばんは";
}

/**
 * Web の GreetingHeader.jsx を移植。
 *
 * 日付の右に集金までのカウントダウンを並べる。
 * ⚠️ **同じ日数を出すカードを画面内にもう 1 枚置かないこと。**
 *    集金予定（毎月◯日）もこのカードが下段に持っている。
 */
export function GreetingHeader({
  username = "集金担当者",
  schedule,
  onOpenSettings,
}: {
  username?: string;
  /** 未取得・未設定なら小型カードごと出さない */
  schedule?: CollectSchedule | null;
  /**
   * 設定を開く。**2026-08-03 にタブから外してここへ移した**（経費と入れ替え）。
   *
   * ⚠️ **これがアプリで唯一の設定への入口。** 渡し忘れるとボタンが出ず、
   *    **サインアウト・組織への参加・プラン・通知の設定に二度と辿り着けない。**
   * ⚠️ **組織未所属の画面にも必ず渡すこと。** そのときはタブがホーム 1 本だけで、
   *    かつ「組織に参加する」導線が設定の中にある。
   */
  onOpenSettings?: () => void;
}) {
  const today = nowInJst();
  const dayIndex = today.getDay();

  return (
    <View>
      <View style={styles.greetingRow}>
        <Text style={styles.greeting} numberOfLines={1}>
          {getGreeting(today.getHours())}、{username}さん
        </Text>
        {onOpenSettings && (
          <Pressable
            onPress={onOpenSettings}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="設定"
            style={({ pressed }) => [styles.gear, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="settings-outline" size={22} color={color.tealDeeper} />
          </Pressable>
        )}
      </View>
      <View style={styles.headRow}>
        {/* ⚠️ shrink を付けないと、日付が長い月にカウントダウンが画面外へ押し出される */}
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={16} color={color.teal} />
          <Text style={styles.date} numberOfLines={1}>
            {today.getFullYear()}年{today.getMonth() + 1}月{today.getDate()}日
          </Text>
          <Text style={[styles.day, { color: DAY_COLOR[dayIndex] ?? color.textMuted }]}>
            （{DAYS[dayIndex]}）
          </Text>
        </View>
        <CollectCountdown schedule={schedule} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ⚠️ 歯車を右端に置くので、あいさつ側は shrink させる（長い名前で押し出されないように） */
  greetingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 6 },
  greeting: { flex: 1, fontFamily: font.uiBold, fontSize: 22, color: color.textMain },
  /* ⚠️ 44x44 を確保する。アイコンだけだと指で押しにくい */
  gear: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  date: { fontFamily: font.uiBold, fontSize: 16, color: color.textMain },
  day: { fontFamily: font.uiBold, fontSize: 16 },
});
