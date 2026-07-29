import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  formatJstDate,
  getEpochTimeInSeconds,
  nowInJst,
  toJstMidnightEpoch,
} from "@/shared/date";
import { color, font, radius, spacing, HIT_SIZE, numeric } from "@/theme/tokens";

/**
 * 集金日を選ぶ月送りカレンダー。
 *
 * Web の EpochTimeSelector（selectDate/SelectDate.jsx）を置き換えるもの。
 * Web は年/月/日の <select> 3 連だが、現場では片手でタップしたいのでグリッドにした。
 * 扱う値は Web とまったく同じ「JST 深夜 0 時の epoch（ミリ秒）」で、
 * 組み立ては必ず src/shared/date.ts の getEpochTimeInSeconds() に通す。
 * 自前で 9 時間ずらす計算は書かないこと（date.ts と二重管理になり 1 日ずれる）。
 *
 * npm パッケージを足さずに済ませるため View と Text だけで組んでいる。
 * Web ビルド（スマホのブラウザ）でも動くよう、iOS 専用 API は使っていない。
 */

const WEEK_DAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 日曜は赤、土曜は青。それ以外は通常色（GreetingHeader.tsx の DAY_COLOR と同じ慣習） */
const DAY_COLOR: (string | null)[] = [
  color.red500,
  null,
  null,
  null,
  null,
  null,
  color.blue500,
];

/**
 * 選べる範囲。Web の SelectDate.jsx が作る年リスト
 *   Array.from({ length: 61 }, (_, i) => 今年 - 50 + i)
 * と同じで、過去 50 年〜未来 10 年。
 *
 * ⚠️ 未来の日付は本家でも選べる（years に未来 10 年分が入っていて、
 * かつ日付側に上限チェックが無い）。集金してから後日まとめて入力する運用や、
 * 端末の時計がずれている場合に備えてのものなので、ここでも塞がない。
 */
const YEARS_BACK = 50;
const YEARS_AHEAD = 10;

type JstParts = { year: number; month: number; day: number };

/**
 * epoch（JST 深夜 0 時・ミリ秒）から年月日を取り出す。
 *
 * JST のオフセットをこのファイルで持つと date.ts と二重管理になるので、
 * 正本である formatJstDate()（"2026/7/27" を返す）の出力を分解して使う。
 */
export function jstParts(epochMs: number): JstParts {
  const parts = formatJstDate(epochMs).split("/");
  return {
    year: Number(parts[0]),
    month: Number(parts[1]),
    day: Number(parts[2]),
  };
}

/**
 * その年月日の曜日（0=日 … 6=土）。
 * 端末 TZ に引きずられないよう UTC で作った Date から取る。
 */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** その月の日数。Date.UTC(y, m, 0) は「翌月 0 日」= 当月末日 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 年月の大小比較用。2026 年 7 月 → 24319 */
function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/** "2026/7/27（月）"。集金日の見出し表示用 */
export function formatJstDateLong(epochMs: number): string {
  const { year, month, day } = jstParts(epochMs);
  return `${formatJstDate(epochMs)}（${WEEK_DAYS[weekdayOf(year, month, day)]}）`;
}

export function CalendarPicker({
  value,
  onChange,
  style,
}: {
  /** 選択中の日。JST 深夜 0 時の epoch（ミリ秒） */
  value: number;
  onChange: (epochMs: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const selected = jstParts(value);
  const todayEpoch = useMemo(() => toJstMidnightEpoch(nowInJst()), []);
  const today = useMemo(() => jstParts(todayEpoch), [todayEpoch]);

  // 表示中の年月。選択日が外から変わったら（下書きの復元など）そこへ追従する
  const [view, setView] = useState({ year: selected.year, month: selected.month });
  useEffect(() => {
    const next = jstParts(value);
    setView({ year: next.year, month: next.month });
  }, [value]);

  const minIndex = monthIndex(today.year - YEARS_BACK, 1);
  const maxIndex = monthIndex(today.year + YEARS_AHEAD, 12);
  const current = monthIndex(view.year, view.month);

  /** 先頭の空きマス + 1 日〜末日。7 列に並べる */
  const cells = useMemo(() => {
    const lead = weekdayOf(view.year, view.month, 1);
    const last = daysInMonth(view.year, view.month);
    const list: (number | null)[] = [];
    for (let i = 0; i < lead; i += 1) list.push(null);
    for (let d = 1; d <= last; d += 1) list.push(d);
    return list;
  }, [view.year, view.month]);

  function shiftMonth(delta: number) {
    const next = monthIndex(view.year, view.month) + delta;
    if (next < minIndex || next > maxIndex) return;
    Haptics.selectionAsync().catch(() => {});
    // 月をまたぐ繰り上がり・繰り下がりは Date に任せる
    const d = new Date(Date.UTC(view.year, view.month - 1 + delta, 1));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }

  function pick(day: number) {
    Haptics.selectionAsync().catch(() => {});
    // ⚠️ Date の getTime() をそのまま渡さないこと。必ず年月日から組み立てる
    onChange(getEpochTimeInSeconds(view.year, view.month, day));
  }

  function jumpToToday() {
    Haptics.selectionAsync().catch(() => {});
    setView({ year: today.year, month: today.month });
    onChange(todayEpoch);
  }

  return (
    <View style={[styles.panel, style]}>
      <View style={styles.navRow}>
        <Pressable
          onPress={() => shiftMonth(-1)}
          disabled={current <= minIndex}
          accessibilityRole="button"
          accessibilityLabel="前の月"
          style={({ pressed }) => [
            styles.navButton,
            pressed && { opacity: 0.7 },
            current <= minIndex && styles.navButtonDisabled,
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={color.teal} />
        </Pressable>

        <Text style={styles.navLabel}>
          {view.year}年 {view.month}月
        </Text>

        <Pressable
          onPress={() => shiftMonth(1)}
          disabled={current >= maxIndex}
          accessibilityRole="button"
          accessibilityLabel="次の月"
          style={({ pressed }) => [
            styles.navButton,
            pressed && { opacity: 0.7 },
            current >= maxIndex && styles.navButtonDisabled,
          ]}
        >
          <Ionicons name="chevron-forward" size={20} color={color.teal} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEK_DAYS.map((label, i) => (
          <View key={label} style={styles.cell}>
            <Text style={[styles.weekLabel, { color: DAY_COLOR[i] ?? color.textMuted }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`blank-${i}`} style={styles.cell} />;

          const weekday = weekdayOf(view.year, view.month, day);
          const isSelected =
            selected.year === view.year &&
            selected.month === view.month &&
            selected.day === day;
          const isToday =
            today.year === view.year && today.month === view.month && today.day === day;

          return (
            <Pressable
              key={day}
              onPress={() => pick(day)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${view.year}年${view.month}月${day}日`}
              // 7 列に割ると 1 マスの幅が 48pt を少し切る端末があるので hitSlop で補う
              hitSlop={4}
              style={({ pressed }) => [styles.cell, pressed && { opacity: 0.6 }]}
            >
              <View
                style={[
                  styles.day,
                  isToday && styles.dayToday,
                  isSelected && styles.daySelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    { color: DAY_COLOR[weekday] ?? color.textMain },
                    isSelected && styles.dayLabelSelected,
                  ]}
                >
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={jumpToToday}
        accessibilityRole="button"
        style={({ pressed }) => [styles.todayButton, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="today-outline" size={16} color={color.teal} />
        <Text style={styles.todayLabel}>今日</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    padding: spacing.md,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  navButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderRadius: radius.card,
    backgroundColor: color.tealPale,
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonDisabled: { opacity: 0.35 },
  navLabel: { fontFamily: font.uiBold, fontSize: 16, color: color.tealDeeper },

  weekRow: { flexDirection: "row", marginBottom: spacing.xs },
  weekLabel: { fontFamily: font.uiBold, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  // 7 列。RN の flexWrap は端数を吸収しないので幅は % で持たせる
  cell: {
    width: "14.28%",
    minHeight: HIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  day: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dayToday: { borderWidth: 1.5, borderColor: color.cyan300 },
  daySelected: { backgroundColor: color.teal, borderWidth: 0 },
  dayLabel: { ...numeric, fontSize: 15 },
  dayLabelSelected: { color: "#FFFFFF" },

  todayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: color.divider,
    paddingTop: spacing.sm,
  },
  todayLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
});
