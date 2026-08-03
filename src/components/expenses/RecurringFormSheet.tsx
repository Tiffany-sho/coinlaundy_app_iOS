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
import { ApiError } from "@/api/client";
import { useCreateRecurringExpense, useStores } from "@/api/queries";
import { Field, FormError, Input, Select } from "@/components/common/form";
import { useToast } from "@/components/common/toast";
import { Button, Muted } from "@/components/common/ui";
import { DEFAULT_CATEGORY, EXPENSE_CATEGORIES } from "@/components/expenses/categories";
import { currentMonthIndex, monthKey, monthLabel } from "@/components/revenue/monthIndex";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";

/**
 * 毎月の固定費を足すシート。
 *
 * ⚠️ **名前の入力欄は無い**（2026-08-03 に外した）。「家賃」という固定費に
 *    「家賃」と名前を付けるだけの欄になっていたため、カテゴリで足りる。
 *    ⚠️ **列は NOT NULL のまま。** サーバがカテゴリで埋める（`recurringName`）。
 *    ⚠️ **Web の入力欄は残っている。** 送られた名前はサーバが尊重するので、
 *       Web で付けた名前は消えない。**片方だけ見て「名前は使っていない」と
 *       判断しないこと。**
 *
 * ⚠️ **ここで作るのは「定義」で、経費のレコードは 1 件も作られない。**
 *    一覧を開いたときに期間内の各月へ展開される。したがって
 *    **金額を変えると過去の月まで遡って変わる。**
 */
export function RecurringFormSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      {/* ⚠️ key を付けずに中身を残すと、閉じて開き直したとき前の入力が残る */}
      {open && <SheetBody onClose={onClose} />}
    </Modal>
  );
}

function SheetBody({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const stores = useStores();
  const create = useCreateRecurringExpense();

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [day, setDay] = useState("1");
  const [storeId, setStoreId] = useState("");

  const amountValue = Number(amount);
  const dayValue = Number(day);
  const canSubmit =
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    Number.isInteger(dayValue) &&
    dayValue >= 1 &&
    dayValue <= 28 &&
    !create.isPending;

  const storeOptions = [
    // ⚠️ 空文字 = 組織全体。null を Select の値にできないのでここで畳んでいる
    { value: "", label: "組織全体（店舗に紐づけない）" },
    ...(stores.data ?? []).map((s) => ({ value: s.id, label: `${s.store}店` })),
  ];

  function onAdd() {
    create.mutate(
      {
        storeId: storeId === "" ? null : storeId,
        /*
          ⚠️ **名前はカテゴリをそのまま送る。** サーバも空なら同じ値で埋めるが、
             ここで送っておくと**古いサーバ（名前必須）でも通る。**
        */
        name: category,
        amount: amountValue,
        category,
        dayOfMonth: dayValue,
        // ⚠️ 既定は今月から。過去に遡らせない（過去の集計が急に変わる）
        startMonth: monthKey(currentMonthIndex()),
        endMonth: null,
      },
      {
        onSuccess: () => {
          toast.success(`毎月の${category}を追加しました`);
          onClose();
        },
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : "追加できませんでした"),
      }
    );
  }

  return (
    /* ⚠️ 上限は**親**に持たせる。ScrollView に maxHeight を付けると
          1 回目の指が空振りする（docs/traps.md のシート） */
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>毎月の固定費を追加</Text>
          <Muted style={styles.lead}>
            家賃や水道光熱費のように毎月かかるものを登録すると、経費の一覧に自動で計上されます。
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

            {/* ⚠️ 28 まで。29〜31 はその日が無い月で計上が飛ぶ */}
            <Field label="毎月の支払日（1〜28）">
              <Input
                value={day}
                onChangeText={(t) => setDay(t.replace(/[^0-9]/g, "").slice(0, 2))}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder="1"
                style={numeric}
              />
            </Field>

            <Field label="対象">
              <Select title="対象" value={storeId} onChange={setStoreId} options={storeOptions} />
            </Field>

            <Muted style={styles.note}>
              ⚠️ {monthLabel(currentMonthIndex())}から計上されます。金額を変えると過去の月にも
              反映されるため、途中で金額が変わったときは「今月で終わらせる」を押してから
              新しく追加してください。
            </Muted>

            {create.error && (
              <FormError
                message={
                  create.error instanceof ApiError ? create.error.message : "追加できませんでした"
                }
              />
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Button label="やめる" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label="追加する"
              variant="gradient"
              loading={create.isPending}
              disabled={!canSubmit}
              onPress={onAdd}
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

  note: { fontSize: 11, lineHeight: 17, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
});
