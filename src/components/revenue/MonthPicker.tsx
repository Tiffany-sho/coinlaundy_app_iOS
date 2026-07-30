import { useEffect, useState } from "react";
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
  currentMonthIndex,
  fromMonthIndex,
  monthLabel,
  toMonthIndex,
  type MonthIndex,
} from "@/components/revenue/monthIndex";
import { color, font, radius, spacing, HIT_SIZE, numeric } from "@/theme/tokens";

/**
 * 月を 1 つ選ぶピッカー。
 *
 * ⚠️ **見た目と操作は集金日の `CalendarPicker` に合わせてある**（枠・年送りボタン・
 *    選択中の塗り・下段のショートカット）。日と月で別物に見えると、同じアプリの中で
 *    日付の選び方を 2 回覚えることになる。片方を触るときは必ずもう片方も見ること。
 *    ⚠️ `CalendarPicker` 自体は**日単位**なので流用はできない（週の並びと日数の計算が要る）。
 *
 * ⚠️ もとは 5 年ぶん（最大 60 個）の月チップを横スクロールで並べていた。目的の月まで
 *    指を何度も滑らせることになるので年送り + マス目にしてある。
 */

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function MonthPicker({
  value,
  min,
  max,
  onChange,
  style,
}: {
  value: MonthIndex;
  /** 選べる最古の月（この月を含む） */
  min: MonthIndex;
  /** 選べる最新の月（この月を含む） */
  max: MonthIndex;
  onChange: (index: MonthIndex) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [year, setYear] = useState(() => fromMonthIndex(value).year);

  // 外から値が変わったら（プリセットを押したときなど）その年に合わせる
  useEffect(() => {
    setYear(fromMonthIndex(value).year);
  }, [value]);

  const minYear = fromMonthIndex(min).year;
  const maxYear = fromMonthIndex(max).year;
  const canGoBack = year > minYear;
  const canGoForward = year < maxYear;

  /** 「今月」の位置。CalendarPicker の「今日」に対応する */
  const thisMonth = currentMonthIndex();
  const canJumpToThisMonth = thisMonth >= min && thisMonth <= max;

  function stepYear(delta: number) {
    Haptics.selectionAsync().catch(() => {});
    setYear((prev) => Math.min(maxYear, Math.max(minYear, prev + delta)));
  }

  return (
    <View style={[styles.panel, style]}>
      <View style={styles.navRow}>
        <Pressable
          onPress={() => stepYear(-1)}
          disabled={!canGoBack}
          accessibilityRole="button"
          accessibilityLabel="前の年"
          style={({ pressed }) => [
            styles.navButton,
            pressed && { opacity: 0.7 },
            !canGoBack && styles.navButtonDisabled,
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={color.teal} />
        </Pressable>

        <Text style={styles.navLabel}>{year}年</Text>

        <Pressable
          onPress={() => stepYear(1)}
          disabled={!canGoForward}
          accessibilityRole="button"
          accessibilityLabel="次の年"
          style={({ pressed }) => [
            styles.navButton,
            pressed && { opacity: 0.7 },
            !canGoForward && styles.navButtonDisabled,
          ]}
        >
          <Ionicons name="chevron-forward" size={20} color={color.teal} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {MONTHS.map((month) => {
          const index = toMonthIndex(year, month);
          const disabled = index < min || index > max;
          const selected = index === value;
          // CalendarPicker の「今日」と同じ扱い。枠だけ付けて位置が分かるようにする
          const isThisMonth = index === thisMonth;

          return (
            <Pressable
              key={month}
              disabled={disabled}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(index);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${year}年${month}月`}
              style={({ pressed }) => [styles.cell, pressed && !disabled && { opacity: 0.6 }]}
            >
              <View
                style={[
                  styles.month,
                  isThisMonth && !selected && styles.monthThis,
                  selected && styles.monthSelected,
                ]}
              >
                <Text
                  style={[
                    styles.monthLabel,
                    selected && styles.monthLabelSelected,
                    disabled && styles.monthLabelDisabled,
                  ]}
                >
                  {month}
                </Text>
                <Text
                  style={[
                    styles.monthUnit,
                    selected && styles.monthLabelSelected,
                    disabled && styles.monthLabelDisabled,
                  ]}
                >
                  月
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setYear(fromMonthIndex(thisMonth).year);
          onChange(thisMonth);
        }}
        disabled={!canJumpToThisMonth}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.shortcut,
          pressed && canJumpToThisMonth && { opacity: 0.7 },
          !canJumpToThisMonth && { opacity: 0.35 },
        ]}
      >
        <Ionicons name="today-outline" size={16} color={color.teal} />
        <Text style={styles.shortcutLabel}>今月</Text>
      </Pressable>
    </View>
  );
}

/**
 * たたんだ状態の 1 行。開くと上のピッカーが出る。
 *
 * ⚠️ 集金画面の集金日と同じ形にしてある（値 + 「タップして変更」 + 山形）。
 * ⚠️ **開いたままにしないこと。** 月のマス目は縦 3 行あり、開始月と終了月を
 *    同時に開くとシートが画面より高くなる（以前は両方出しっぱなしだった）。
 *    開閉は呼び出し側が `open` で持ち、どちらか一方だけ開くようにする。
 */
export function MonthField({
  label,
  value,
  min,
  max,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  value: MonthIndex;
  min: MonthIndex;
  max: MonthIndex;
  open: boolean;
  onToggle: () => void;
  onChange: (index: MonthIndex) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onToggle();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.fieldValue, pressed && { opacity: 0.85 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldValueText}>{monthLabel(value)}</Text>
          <Text style={styles.fieldHint}>タップして変更</Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={color.teal} />
      </Pressable>
      {open && (
        <MonthPicker
          value={value}
          min={min}
          max={max}
          onChange={onChange}
          style={{ marginTop: spacing.sm }}
        />
      )}
    </View>
  );
}

/* ⚠️ panel / navRow / navButton / navLabel / shortcut は CalendarPicker と同じ値。
      片方だけ変えると日と月で見た目が食い違う */
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

  /* 4 列 × 3 行。RN の flexWrap は端数を吸収しないので幅は % で持たせる */
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "25%", minHeight: HIT_SIZE, alignItems: "center", justifyContent: "center" },
  month: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    minWidth: 56,
    height: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    /* 枠の有無で幅が動かないよう、常に同じ太さの透明な枠を持たせる */
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  monthThis: { borderColor: color.cyan300 },
  monthSelected: { backgroundColor: color.teal, borderColor: color.teal },
  /* 数字だけ numeric。1 桁と 2 桁で幅が動くとマスの中で位置が揺れる */
  monthLabel: { ...numeric, fontSize: 15, color: color.textMain },
  monthUnit: { fontFamily: font.uiBold, fontSize: 11, color: color.textMain },
  monthLabelSelected: { color: "#FFFFFF" },
  monthLabelDisabled: { color: color.textFaint },

  shortcut: {
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
  shortcutLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },

  /* ── たたんだ行。集金画面の集金日と同じ ── */
  field: { marginBottom: spacing.md },
  fieldLabel: {
    fontFamily: font.uiBold,
    fontSize: 11,
    color: color.textMuted,
    marginBottom: spacing.sm,
  },
  /* ⚠️ 集金画面の dateValue / dateText / dateHint と同じ値。片方だけ変えないこと */
  fieldValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: HIT_SIZE,
    borderRadius: radius.card,
    backgroundColor: color.cardBg,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  /*
     集金日は 17px だが、こちらはシートの中で行が 2 本並ぶので 1 段落とす。
     ⚠️ 集金日と違って numeric（Inter）を使わない。"2026年7月" は「年」「月」を含み、
        Inter はそのグリフを持たないので漢字だけシステムフォントに落ちて書体が混ざる。
   */
  fieldValueText: { fontFamily: font.uiBold, fontSize: 16, color: color.textMain },
  fieldHint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, marginTop: 2 },
});
