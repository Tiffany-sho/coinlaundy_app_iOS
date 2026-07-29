import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CalendarPicker, formatJstDateLong } from "@/components/common/CalendarPicker";
import { Button, Muted } from "@/components/common/ui";
import { color, font, radius, spacing, numeric } from "@/theme/tokens";

/**
 * 集金日の表示と変更。本家 CoinDataCard.jsx の EpochTimeSelector に当たる。
 *
 * ⚠️ 選んだだけでは送らない。履歴の書き換えなので確定は明示的に押させる。
 * ⚠️ 値は JST 深夜 0 時の epoch（CalendarPicker が組み立て済み）。
 *    端末 TZ の Date.getTime() を混ぜないこと（1 日ずれる）。
 */
export function FundDateSection({
  savedDate,
  canEdit,
  saving,
  busy,
  onSave,
}: {
  /** 保存済みの集金日。保存に成功したときだけ親が動かす */
  savedDate: number | null;
  canEdit: boolean;
  saving: boolean;
  busy: boolean;
  onSave: (epoch: number) => void;
}) {
  /** カレンダーで選択中の日。保存するまで savedDate は動かさない */
  const [draft, setDraft] = useState<number | null>(savedDate);
  const [open, setOpen] = useState(false);

  // 親が保存に成功して savedDate が動いたら、選択中もそこへ揃える
  const [lastSaved, setLastSaved] = useState(savedDate);
  if (lastSaved !== savedDate) {
    setLastSaved(savedDate);
    setDraft(savedDate);
    setOpen(false);
  }

  const shown = draft ?? savedDate;
  if (shown === null) {
    return <Muted>集金日を取得できませんでした。売上履歴から開き直してください。</Muted>;
  }

  const dirty = draft !== null && draft !== savedDate;

  return (
    <>
      <Pressable
        onPress={() => {
          if (!canEdit) return;
          Haptics.selectionAsync().catch(() => {});
          setOpen((prev) => !prev);
        }}
        disabled={!canEdit}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !canEdit }}
        style={({ pressed }) => [styles.dateValue, pressed && { opacity: 0.85 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.dateText}>{formatJstDateLong(shown)}</Text>
          {canEdit && <Text style={styles.dateHint}>タップして変更</Text>}
        </View>
        {canEdit && (
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={color.teal} />
        )}
      </Pressable>

      {open && canEdit && (
        <CalendarPicker value={shown} onChange={setDraft} style={{ marginTop: spacing.sm }} />
      )}

      {dirty && canEdit && (
        <View style={styles.actionRow}>
          <Button
            label="取り消し"
            variant="ghost"
            onPress={() => {
              setDraft(savedDate);
              setOpen(false);
            }}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <Button
            label="この日付で保存"
            variant="gradient"
            onPress={() => draft !== null && onSave(draft)}
            loading={saving}
            disabled={busy}
            style={{ flex: 1.4 }}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  dateValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.card,
    backgroundColor: color.cardBg,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dateText: { ...numeric, fontSize: 17, color: color.textMain },
  dateHint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
});
