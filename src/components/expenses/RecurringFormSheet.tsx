import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ApiError } from "@/api/client";
import {
  useCreateRecurringExpense,
  useStores,
  useUpdateRecurringExpense,
} from "@/api/queries";
import { Field, FormError, Input, Select } from "@/components/common/form";
import { useToast } from "@/components/common/toast";
import { Button, Muted } from "@/components/common/ui";
import { DEFAULT_CATEGORY, EXPENSE_CATEGORIES } from "@/components/expenses/categories";
import { MonthPicker } from "@/components/revenue/MonthPicker";
import {
  currentMonthIndex,
  monthKey,
  monthLabel,
  toMonthIndex,
  type MonthIndex,
} from "@/components/revenue/monthIndex";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { RecurringExpense } from "@/api/types";

/**
 * `"YYYY-MM"` → 月の連番。
 *
 * ⚠️ **読めなければ `null` を返す。** 呼び出し側が今月に倒す。
 *    ⚠️ **`new Date("2026-08")` を使わない。** ISO 以外の書式のパースは
 *    実装依存で、Hermes は通さない（`docs/traps.md` の Hermes）。数値だけで組む。
 */
function monthIndexFromKey(key: string | null | undefined): MonthIndex | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key ?? ""));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return toMonthIndex(year, month);
}

/**
 * 毎月の固定費を足す／直すシート。
 *
 * ⚠️ **名前の入力欄は無い**（2026-08-03 に外した）。「家賃」という固定費に
 *    「家賃」と名前を付けるだけの欄になっていたため、カテゴリで足りる。
 *    ⚠️ **列は NOT NULL のまま。** サーバがカテゴリで埋める（`recurringName`）。
 *    ⚠️ **Web の入力欄は残っている。** 送られた名前はサーバが尊重するので、
 *       Web で付けた名前は消えない。**片方だけ見て「名前は使っていない」と
 *       判断しないこと。** 編集では**既存の値をそのまま返す**（消さないため）。
 *
 * ⚠️ **ここで作るのは「定義」で、経費のレコードは 1 件も作られない。**
 *    一覧を開いたときに期間内の各月へ展開される。したがって
 *    **金額を変えると過去の月まで遡って変わる。**
 *
 * ⚠️ **支払日（`day_of_month`）は聞かない**（2026-08-05）。展開は月単位で、
 *    日は**どこにも表示されず集計にも効かない**（`expandRecurring` は
 *    その月の該当日の epoch を作るだけ）。聞くと「何日にしたら計上が変わるのか」を
 *    考えさせるだけになる。**列は NOT NULL・CHECK 1〜28 のまま**なので必ず 1 を送る。
 */
export function RecurringFormSheet({
  open,
  onClose,
  editing = null,
}: {
  open: boolean;
  onClose: () => void;
  /** 渡すと編集になる。⚠️ **null で追加**（同じシートを使い回す） */
  editing?: RecurringExpense | null;
}) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      {/* ⚠️ key を付けずに中身を残すと、閉じて開き直したとき前の入力が残る */}
      {open && <SheetBody onClose={onClose} editing={editing} />}
    </Modal>
  );
}

function SheetBody({
  onClose,
  editing,
}: {
  onClose: () => void;
  editing: RecurringExpense | null;
}) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const stores = useStores();
  const create = useCreateRecurringExpense();
  const update = useUpdateRecurringExpense();

  const isEdit = editing !== null;
  const mutation = isEdit ? update : create;

  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [category, setCategory] = useState(editing?.category ?? DEFAULT_CATEGORY);
  const [storeId, setStoreId] = useState(editing?.laundryId ?? "");
  /**
   * いつから計上するか。
   * ⚠️ **`start_month` は "YYYY-MM" の文字列。** 画面では月の連番で持ち、
   *    送るときだけ `monthKey` で畳む（`monthIndex.ts` と同じ規約）。
   * ⚠️ **既存の値が読めないときは今月に倒す。** 過去へ倒すと、開いて保存し直した
   *    だけで**過去の月に固定費が生えて集計が変わる。**
   */
  const [startMonth, setStartMonth] = useState<MonthIndex>(() =>
    monthIndexFromKey(editing?.startMonth) ?? currentMonthIndex()
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const amountValue = Number(amount);
  const canSubmit = Number.isFinite(amountValue) && amountValue > 0 && !mutation.isPending;

  const storeOptions = [
    // ⚠️ 空文字 = 組織全体。null を Select の値にできないのでここで畳んでいる
    { value: "", label: "組織全体（店舗に紐づけない）" },
    ...(stores.data ?? []).map((s) => ({ value: s.id, label: `${s.store}店` })),
  ];

  function onSubmit() {
    const payload = {
      storeId: storeId === "" ? null : storeId,
      /*
        ⚠️ **編集では既存の名前をそのまま返す。** Web には名前の入力欄が残っていて、
           あちらで付けた名前を**空で上書きすると消える。**
        ⚠️ 追加ではカテゴリを送る。サーバも空ならカテゴリで埋めるが、
           ここで送っておくと**古いサーバ（名前必須）でも通る。**
      */
      name: editing?.name || category,
      amount: amountValue,
      category,
      /* ⚠️ 列は NOT NULL・CHECK 1〜28。聞かなくなったので必ず 1 を送る */
      dayOfMonth: 1,
      startMonth: monthKey(startMonth),
      /* ⚠️ 終了月は触らない。「今月で終わらせる」が別に持っている操作 */
      endMonth: editing?.endMonth ?? null,
    };

    const done = {
      onSuccess: () => {
        toast.success(isEdit ? `毎月の${category}を保存しました` : `毎月の${category}を追加しました`);
        onClose();
      },
      onError: (e: unknown) =>
        toast.error(
          e instanceof ApiError ? e.message : isEdit ? "保存できませんでした" : "追加できませんでした"
        ),
    };

    if (editing) update.mutate({ id: editing.id, ...payload }, done);
    else create.mutate(payload, done);
  }

  return (
    /* ⚠️ 上限は**親**に持たせる。ScrollView に maxHeight を付けると
          1 回目の指が空振りする（docs/traps.md のシート） */
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{isEdit ? "毎月の固定費を編集" : "毎月の固定費を追加"}</Text>
          <Muted style={styles.lead}>
            {isEdit
              ? "金額を変えると、計上済みの月にもさかのぼって反映されます。「今月から上がった」ときは、この定義は変えずに「今月で終わらせる」を押してから新しく追加してください。"
              : "家賃や水道光熱費のように毎月かかるものを登録すると、経費の一覧に自動で計上されます。"}
          </Muted>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
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

            {/* ⚠️ 名前の欄は置かない。カテゴリが表示名を兼ねる */}
            <Field label="カテゴリ">
              <Select
                title="カテゴリ"
                value={category}
                onChange={setCategory}
                options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </Field>

            {/*
              ⚠️ **支払日ではなく「いつから」を聞く**（2026-08-05）。
                 展開は月単位なので、日を変えても計上される月は 1 つも変わらない。
              ⚠️ **未来の月も選べる。** 「来月から家賃が発生する」を先に登録できる
                 （`expandRecurring` は期間と重なる月にだけ展開するので空振りしない）。
            */}
            <Field label="いつから">
              <Pressable
                onPress={() => setPickerOpen((v) => !v)}
                accessibilityRole="button"
                style={styles.monthValue}
              >
                <Text style={styles.monthText}>{monthLabel(startMonth)}から</Text>
                <Ionicons
                  name={pickerOpen ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={color.teal}
                />
              </Pressable>
              {pickerOpen && (
                <MonthPicker
                  value={startMonth}
                  /* ⚠️ 遡れる下限を切っておく。無いと 10 年前から計上できてしまう */
                  min={currentMonthIndex() - 60}
                  max={currentMonthIndex() + 12}
                  onChange={(next) => {
                    setStartMonth(next);
                    setPickerOpen(false);
                  }}
                  style={{ marginTop: spacing.sm }}
                />
              )}
            </Field>

            <Field label="対象">
              <Select title="対象" value={storeId} onChange={setStoreId} options={storeOptions} />
            </Field>

            <Muted style={styles.note}>
              ⚠️ {monthLabel(startMonth)}から毎月かかるものとして計上されます。
              金額を変えると計上済みの月にもさかのぼって反映されるため、途中で金額が
              変わったときは「今月で終わらせる」を押してから新しく追加してください。
            </Muted>

            {mutation.error && (
              <FormError
                message={
                  mutation.error instanceof ApiError
                    ? mutation.error.message
                    : isEdit
                      ? "保存できませんでした"
                      : "追加できませんでした"
                }
              />
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Button label="やめる" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label={isEdit ? "保存する" : "追加する"}
              variant="gradient"
              loading={mutation.isPending}
              disabled={!canSubmit}
              onPress={onSubmit}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    maxHeight: "92%",
    backgroundColor: color.cardBg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.divider,
    marginBottom: spacing.md,
  },
  title: { fontFamily: font.uiBold, fontSize: 17, color: color.textMain },
  lead: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  body: { flexShrink: 1, marginTop: spacing.md },

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

  monthValue: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderRadius: radius.card - 6,
    backgroundColor: color.cardBg,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    paddingHorizontal: spacing.lg,
  },
  monthText: { ...numeric, flex: 1, fontSize: 16, color: color.textMain },

  note: { fontSize: 11, lineHeight: 17, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
});
