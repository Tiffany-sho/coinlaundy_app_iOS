import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
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
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

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
 *
 * 見出し（「2026年 7月」）を押すと年 → 月と選び直せる。
 * 過去データの一括入力で数年前へ飛ぶのに月送りだけでは回数がかかりすぎるため。
 * ⚠️ 年の一覧は新しい年を先頭にした降順。昇順に変えないこと。
 *    先頭は未来 10 年ぶんなので、開いた時点で選択中の年まで自動スクロールする。
 *    これが無いと 2036 年から始まって見え、過去に遡る用途で毎回スクロールが要る。
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

/** 年の一覧の段組み。スクロール位置を出すのに使うので、styles.jumpCell と必ず揃える */
const YEAR_COLUMNS = 4;
/** jumpChip の minHeight 40 + jumpCell の上下 padding 4+4 */
const YEAR_ROW_HEIGHT = 48;

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

  /** "day" = 日グリッド、"year" = 年の一覧、"month" = 12 か月グリッド */
  const [mode, setMode] = useState<"day" | "year" | "month">("day");

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

  /** 選べる年。新しい年が先頭（降順） */
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = today.year + YEARS_AHEAD; y >= today.year - YEARS_BACK; y -= 1) list.push(y);
    return list;
  }, [today.year]);

  const yearScrollRef = useRef<ScrollView>(null);

  /** 選択中の年がいちばん上に来るよう合わせる。年の一覧を開いた直後に呼ぶ */
  const scrollToSelectedYear = useCallback(() => {
    const index = years.indexOf(view.year);
    if (index < 0) return;
    yearScrollRef.current?.scrollTo({
      y: Math.floor(index / YEAR_COLUMNS) * YEAR_ROW_HEIGHT,
      animated: false,
    });
  }, [years, view.year]);

  function pickYear(year: number) {
    Haptics.selectionAsync().catch(() => {});
    setView((v) => ({ ...v, year }));
    setMode("month");
  }

  function pickMonth(month: number) {
    Haptics.selectionAsync().catch(() => {});
    setView((v) => ({ ...v, month }));
    setMode("day");
  }

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
    setMode("day");
    onChange(todayEpoch);
  }

  /** 見出し。押すと年 → 月と絞り込める */
  const header = (
    <View style={styles.navRow}>
      <Pressable
        onPress={() => (mode === "day" ? shiftMonth(-1) : setMode(mode === "month" ? "year" : "day"))}
        disabled={mode === "day" && current <= minIndex}
        accessibilityRole="button"
        accessibilityLabel={mode === "day" ? "前の月" : "戻る"}
        style={({ pressed }) => [
          styles.navButton,
          pressed && { opacity: 0.7 },
          mode === "day" && current <= minIndex && styles.navButtonDisabled,
        ]}
      >
        <Ionicons name="chevron-back" size={20} color={color.teal} />
      </Pressable>

      <Pressable
        onPress={() => setMode(mode === "day" ? "year" : "day")}
        accessibilityRole="button"
        accessibilityLabel={mode === "day" ? "年月を選ぶ" : "カレンダーに戻る"}
        style={({ pressed }) => [styles.navLabelButton, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.navLabel}>
          {mode === "year" ? "年を選ぶ" : mode === "month" ? `${view.year}年` : `${view.year}年 ${view.month}月`}
        </Text>
        <Ionicons
          name={mode === "day" ? "chevron-down" : "chevron-up"}
          size={14}
          color={color.tealDeeper}
        />
      </Pressable>

      {mode === "day" ? (
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
      ) : (
        <View style={styles.navButton} />
      )}
    </View>
  );

  if (mode === "year") {
    return (
      <View style={[styles.panel, style]}>
        {header}
        {/*
          61 年ぶんあるので縦スクロール。
          onContentSizeChange は中身が並び終わってから来るので、ここで位置を合わせる
          （useEffect だと web でまだ高さが 0 のことがあり、スクロールが効かない）
        */}
        <ScrollView
          ref={yearScrollRef}
          style={styles.jumpScroll}
          contentContainerStyle={styles.jumpGrid}
          onContentSizeChange={scrollToSelectedYear}
        >
          {years.map((y) => {
            const isSelected = y === view.year;
            return (
              <Pressable
                key={y}
                onPress={() => pickYear(y)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${y}年`}
                style={({ pressed }) => [styles.jumpCell, pressed && { opacity: 0.6 }]}
              >
                <View style={[styles.jumpChip, isSelected && styles.jumpChipSelected]}>
                  <Text style={[styles.jumpLabel, isSelected && styles.jumpLabelSelected]}>
                    {y}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  if (mode === "month") {
    return (
      <View style={[styles.panel, style]}>
        {header}
        <View style={styles.jumpGrid}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const isSelected = m === view.month;
            return (
              <Pressable
                key={m}
                onPress={() => pickMonth(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${m}月`}
                style={({ pressed }) => [styles.jumpCell, pressed && { opacity: 0.6 }]}
              >
                <View style={[styles.jumpChip, isSelected && styles.jumpChipSelected]}>
                  <Text style={[styles.jumpLabel, isSelected && styles.jumpLabelSelected]}>
                    {m}月
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.panel, style]}>
      {header}

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
  navLabelButton: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: HIT_SIZE, paddingHorizontal: spacing.sm },
  navLabel: { fontFamily: font.uiBold, fontSize: 16, color: color.tealDeeper },

  // 年 / 月のジャンプ用。4 列で並べる
  jumpScroll: { maxHeight: 260 },
  jumpGrid: { flexDirection: "row", flexWrap: "wrap" },
  jumpCell: { width: "25%", paddingVertical: 4, alignItems: "center", justifyContent: "center" },
  jumpChip: {
    minWidth: 62,
    minHeight: 40,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpChipSelected: { backgroundColor: color.teal },
  jumpLabel: { fontFamily: font.mono, fontSize: 14, color: color.textMain },
  jumpLabelSelected: { color: "#FFFFFF", fontFamily: font.uiBold },

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
  dayLabel: { fontFamily: font.mono, fontSize: 15 },
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
