import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CalendarPicker, formatJstDateLong } from "@/components/common/CalendarPicker";
import { Input } from "@/components/common/form";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/** 過去の集金 1 件ぶん。金額は「円」の文字列で持つ（入力途中の空文字を表せるようにするため） */
export type BackfillEntry = {
  id: string;
  /** JST 深夜 0 時の epoch（ミリ秒） */
  date: number;
  /** 円。⚠️ 硬貨の枚数ではない */
  amount: string;
};

/**
 * 過去データ入力の 1 行。日付ボタン + 金額入力 + 削除。
 *
 * ⚠️ 日付選びはカレンダーを行の下にそのまま開く（アコーディオン）。
 *    RN の Modal で出すと、この画面自体が fullScreenModal なので
 *    「Modal の上に Modal」になり iOS で表示に失敗する（docs/traps.md）。
 */
export function BackfillRow({
  index,
  entry,
  expanded,
  duplicated,
  minEpoch,
  onToggleCalendar,
  onChangeDate,
  onChangeAmount,
  onRemove,
}: {
  index: number;
  entry: BackfillEntry;
  expanded: boolean;
  /** 同じ日付が他の行にもあるとき true。警告表示だけで、登録は妨げない */
  duplicated: boolean;
  /** 選べるいちばん古い日。収益グラフに出せない古さを塞ぐためのもの */
  minEpoch: number;
  onToggleCalendar: () => void;
  onChangeDate: (epochMs: number) => void;
  onChangeAmount: (text: string) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text style={styles.index}>{index + 1}</Text>

        <Pressable
          onPress={onToggleCalendar}
          accessibilityRole="button"
          accessibilityLabel={`${index + 1} 行目の集金日を選ぶ`}
          style={({ pressed }) => [styles.dateButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="calendar-outline" size={15} color={color.teal} />
          <Text style={styles.dateLabel}>{formatJstDateLong(entry.date)}</Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={color.tealDeeper}
          />
        </Pressable>

        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${index + 1} 行目を削除`}
          style={({ pressed }) => [styles.removeButton, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close" size={18} color={color.textMuted} />
        </Pressable>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.yen}>¥</Text>
        <Input
          value={entry.amount}
          onChangeText={onChangeAmount}
          keyboardType="number-pad"
          placeholder="0"
          accessibilityLabel={`${index + 1} 行目の集金金額`}
          style={styles.amountInput}
        />
      </View>

      {duplicated && (
        <Text style={styles.warn}>同じ日付の行が他にもあります</Text>
      )}

      {expanded && (
        <CalendarPicker
          value={entry.date}
          onChange={onChangeDate}
          minEpoch={minEpoch}
          style={{ marginTop: spacing.sm }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.divider,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  index: {
    fontFamily: font.mono,
    fontSize: 12,
    color: color.textMuted,
    minWidth: 18,
  },
  dateButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: color.tealPale,
  },
  dateLabel: { flex: 1, fontFamily: font.ui, fontSize: 14, color: color.textMain },
  removeButton: {
    width: HIT_SIZE - 8,
    height: HIT_SIZE - 8,
    alignItems: "center",
    justifyContent: "center",
  },
  amountRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  yen: { fontFamily: font.uiBold, fontSize: 16, color: color.textMuted },
  amountInput: { flex: 1, textAlign: "right", fontFamily: font.mono },
  warn: { fontFamily: font.ui, fontSize: 12, color: color.red500, marginTop: spacing.xs },
});
