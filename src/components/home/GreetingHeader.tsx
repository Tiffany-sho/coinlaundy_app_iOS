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
 * あいさつ + 歯車 / 今日の日付 / 集金までのカウントダウン（横幅いっぱい）。
 *
 * ⚠️ **カウントダウンを日付の右に戻さない**（2026-08-03）。幅が足りず
 *    **小さすぎて気づかれなかった。** 集金を促すのが役目なので目立たせる。
 * ⚠️ **同じ日数を出すカードを画面内にもう 1 枚置かないこと。**
 *    集金予定（毎月◯日）もあのカードが右側に持っている。
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
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={16} color={color.teal} />
        <Text style={styles.date} numberOfLines={1}>
          {today.getFullYear()}年{today.getMonth() + 1}月{today.getDate()}日
        </Text>
        <Text style={[styles.day, { color: DAY_COLOR[dayIndex] ?? color.textMuted }]}>
          （{DAYS[dayIndex]}）
        </Text>
      </View>

      {/*
        ⚠️ **日付の右に戻さない**（2026-08-03 に横幅いっぱいへ戻した）。
           日付の残り幅しか無く、**小さすぎて気づかれなかった。**
        ⚠️ **`schedule` が無いときは中で null を返す。** ここで条件を書くと、
           「設定しない」と「未取得」の区別がこの 2 か所に散る。
      */}
      <CollectCountdown schedule={schedule} />
    </View>
  );
}

const styles = StyleSheet.create({
  /* ⚠️ 歯車を右端に置くので、あいさつ側は shrink させる（長い名前で押し出されないように） */
  greetingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 6 },
  greeting: { flex: 1, fontFamily: font.uiBold, fontSize: 22, color: color.textMain },
  /* ⚠️ 44x44 を確保する。アイコンだけだと指で押しにくい */
  gear: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  /* ⚠️ カウントダウンとの間隔はここで持つ（カード側に marginTop を持たせない。
        カードは他の場所からも使える形にしておく） */
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    marginBottom: spacing.md,
  },
  date: { fontFamily: font.uiBold, fontSize: 16, color: color.textMain },
  day: { fontFamily: font.uiBold, fontSize: 16 },
});
