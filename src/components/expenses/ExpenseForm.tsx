import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useStores } from "@/api/queries";
import { CalendarPicker } from "@/components/common/CalendarPicker";
import { Field, FormError, Input, Select } from "@/components/common/form";
import { Button, Card, Muted, Screen } from "@/components/common/ui";
import { useKeyboardVisible } from "@/components/common/useKeyboardVisible";
import { DEFAULT_CATEGORY, EXPENSE_CATEGORIES } from "@/components/expenses/categories";
import { formatJstDate, nowInJst, toJstMidnightEpoch } from "@/shared/date";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";

export type ExpenseFormValue = {
  storeId: string | null;
  date: number;
  amount: number;
  category: string;
  note: string | null;
};

/**
 * 経費の入力フォーム。追加と編集で共用する。
 *
 * ⚠️ **金額の単位は「円」。** 集金画面の機種別入力は**硬貨の枚数**なので、
 *    同じアプリの中に単位の違う入力欄がある。`¥` のラベルを消さないこと。
 *
 * ⚠️ **店舗は「組織全体」を選べる。** 税理士費用のように店舗に紐づかない支出があるため。
 *    `storeId: null` がそれで、**必須にしないこと。**
 *
 * ⚠️ **日付は必ず `toJstMidnightEpoch` を通す。** 端末 TZ の `getTime()` を
 *    そのまま送ると 1 日ずれる（集金と同じ規約）。
 */
export function ExpenseForm({
  title,
  initial,
  submitLabel,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
  onDelete,
}: {
  title: string;
  initial?: Partial<ExpenseFormValue>;
  submitLabel: string;
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (value: ExpenseFormValue) => void;
  onCancel: () => void;
  /** 編集のときだけ渡す */
  onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const stores = useStores();

  const [storeId, setStoreId] = useState<string>(initial?.storeId ?? "");
  const [date, setDate] = useState(initial?.date ?? toJstMidnightEpoch(nowInJst()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [category, setCategory] = useState(initial?.category ?? DEFAULT_CATEGORY);
  const [note, setNote] = useState(initial?.note ?? "");

  const amountValue = Number(amount);
  const canSubmit = Number.isFinite(amountValue) && amountValue > 0 && !submitting;

  const storeOptions = [
    // ⚠️ 空文字 = 組織全体。null を Select の値にできないのでここで畳んでいる
    { value: "", label: "組織全体（店舗に紐づけない）" },
    ...(stores.data ?? []).map((s) => ({ value: s.id, label: `${s.store}店` })),
  ];

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={onCancel} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerButton} />
      </View>

      {/*
        ⚠️ **`keyboardVerticalOffset` を渡さない。** ヘッダは同じ親の中にある
           RN のビューなので、その高さは既に frame.y に入っている。渡すと二重に
           数えて ScrollView の下端がキーボードの上に帯状の余白を作る。
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
          <Card>
            <Field label="金額">
              <View style={styles.amountGroup}>
                <View style={styles.addon}>
                  <Text style={styles.addonText}>¥</Text>
                </View>
                <Input
                  value={amount}
                  onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  placeholder="0"
                  style={styles.amountInput}
                />
              </View>
            </Field>

            <Field label="カテゴリ">
              <Select
                title="カテゴリ"
                value={category}
                onChange={setCategory}
                options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </Field>

            <Field label="日付">
              <Pressable
                onPress={() => setCalendarOpen((v) => !v)}
                style={styles.dateValue}
                accessibilityRole="button"
              >
                <Text style={styles.dateText}>{formatJstDate(date)}</Text>
                <Ionicons
                  name={calendarOpen ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={color.teal}
                />
              </Pressable>
              {calendarOpen && (
                <CalendarPicker
                  value={date}
                  onChange={(next) => {
                    setDate(next);
                    setCalendarOpen(false);
                  }}
                  style={{ marginTop: spacing.sm }}
                />
              )}
            </Field>

            <Field label="対象">
              <Select title="対象" value={storeId} onChange={setStoreId} options={storeOptions} />
            </Field>

            <Field label="メモ（任意）">
              <Input
                value={note}
                onChangeText={setNote}
                placeholder="例) 洗剤 20L × 2"
                maxLength={200}
              />
            </Field>

            {errorMessage && <FormError message={errorMessage} />}
          </Card>

          {onDelete && (
            <Pressable
              onPress={onDelete}
              disabled={submitting}
              accessibilityRole="button"
              style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="trash-outline" size={16} color={color.red400} />
              <Text style={styles.deleteLabel}>この経費を削除</Text>
            </Pressable>
          )}
        </ScrollView>

        {/*
          ⚠️ 保存ボタンは KeyboardAvoidingView の**中**に置く。外に出すと
             キーボードの裏に隠れ、いったん閉じないと保存できない。
          ⚠️ キーボードが出ている間は insets.bottom を足さない（ホームバーは
             覆われているので、足すと隙間になる）。
        */}
        <View
          style={[
            styles.footer,
            { paddingBottom: (keyboardVisible ? 0 : insets.bottom) + spacing.md },
          ]}
        >
          <Button
            label={submitLabel}
            variant="gradient"
            loading={submitting}
            disabled={!canSubmit}
            onPress={() =>
              onSubmit({
                storeId: storeId === "" ? null : storeId,
                date,
                amount: amountValue,
                category,
                note: note.trim() === "" ? null : note.trim(),
              })
            }
          />
          <Muted style={styles.hint}>金額は円で入力します</Muted>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: font.uiBold,
    fontSize: 17,
    color: color.tealDeeper,
  },

  amountGroup: { flexDirection: "row", alignItems: "stretch", gap: spacing.sm },
  addon: {
    minWidth: 44,
    borderRadius: radius.card - 6,
    backgroundColor: color.cyan100,
    alignItems: "center",
    justifyContent: "center",
  },
  addonText: { fontFamily: font.uiBold, fontSize: 18, color: color.tealDeeper },
  amountInput: { ...numeric, flex: 1, fontSize: 18 },

  dateValue: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderRadius: radius.card - 6,
    backgroundColor: color.cardBg,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    paddingHorizontal: spacing.lg,
  },
  dateText: { ...numeric, flex: 1, fontSize: 16, color: color.textMain },

  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 48,
    marginTop: spacing.lg,
  },
  deleteLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.red400 },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.cardBg,
  },
  hint: { fontSize: 11, textAlign: "center", marginTop: spacing.xs },
});
