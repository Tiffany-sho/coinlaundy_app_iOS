import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { fromMonthIndex, toMonthIndex, type MonthIndex } from "./monthIndex";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 月を 1 つ選ぶピッカー。年を左右に送り、12 か月をマス目から選ぶ。
 *
 * ⚠️ もとは 5 年ぶん（最大 60 個）の月チップを横スクロールで並べていたが、
 *    目的の月まで指を何度も滑らせることになるので年 + マス目にした。
 *    src/components/CalendarPicker.tsx は**日単位**なので流用できない。
 */

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function MonthRangePicker({
  value,
  min,
  max,
  onChange,
}: {
  value: MonthIndex;
  /** 選べる最古の月（この月を含む） */
  min: MonthIndex;
  /** 選べる最新の月（この月を含む） */
  max: MonthIndex;
  onChange: (index: MonthIndex) => void;
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

  function stepYear(delta: number) {
    Haptics.selectionAsync().catch(() => {});
    setYear((prev) => Math.min(maxYear, Math.max(minYear, prev + delta)));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.yearRow}>
        <ArrowButton
          direction="back"
          disabled={!canGoBack}
          onPress={() => stepYear(-1)}
          label="前の年"
        />
        <Text style={styles.yearLabel}>{year}年</Text>
        <ArrowButton
          direction="forward"
          disabled={!canGoForward}
          onPress={() => stepYear(1)}
          label="次の年"
        />
      </View>

      <View style={styles.grid}>
        {MONTHS.map((month) => {
          const index = toMonthIndex(year, month);
          const disabled = index < min || index > max;
          const selected = index === value;
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
              style={({ pressed }) => [
                styles.cell,
                selected && styles.cellSelected,
                disabled && styles.cellDisabled,
                pressed && !disabled && { opacity: 0.75 },
              ]}
            >
              <Text
                style={[
                  styles.cellLabel,
                  selected && styles.cellLabelSelected,
                  disabled && styles.cellLabelDisabled,
                ]}
              >
                {month}月
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ArrowButton({
  direction,
  disabled,
  onPress,
  label,
}: {
  direction: "back" | "forward";
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.arrow,
        disabled && styles.arrowDisabled,
        pressed && !disabled && { opacity: 0.7 },
      ]}
    >
      <Ionicons
        name={direction === "back" ? "chevron-back" : "chevron-forward"}
        size={18}
        color={disabled ? color.textFaint : color.tealDeeper}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  yearLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain, minWidth: 72, textAlign: "center" },
  arrow: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.cyan100,
    backgroundColor: color.appBg,
  },
  arrowDisabled: { borderColor: color.divider, backgroundColor: color.cardBg },

  /* 3 行 × 4 列。gap ぶんを引いた幅を 4 等分する */
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cell: {
    flexBasis: "22%",
    flexGrow: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.divider,
    backgroundColor: color.cardBg,
  },
  cellSelected: { borderColor: color.cyan400, backgroundColor: color.cyan50 },
  cellDisabled: { borderColor: color.divider, backgroundColor: color.appBg },
  cellLabel: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
  cellLabelSelected: { fontFamily: font.uiBold, color: color.cyan700 },
  cellLabelDisabled: { color: color.textFaint },
});
