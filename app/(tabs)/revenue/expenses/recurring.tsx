import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useCreateRecurringExpense,
  useDeleteRecurringExpense,
  useRecurringExpenses,
  useStores,
  useUpdateRecurringExpense,
} from "@/api/queries";
import { ApiError } from "@/api/client";
import { Button, Card, CenterMessage, Muted, Screen } from "@/components/common/ui";
import { Field, FormError, Input, Select } from "@/components/common/form";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { DEFAULT_CATEGORY, EXPENSE_CATEGORIES } from "@/components/expenses/categories";
import { currentMonthIndex, monthKey } from "@/components/revenue/monthIndex";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { RecurringExpense } from "@/api/types";

/**
 * 毎月かかる固定費（家賃・水道光熱費など）の設定。
 *
 * ⚠️ **ここで登録するのは「定義」で、経費のレコードは作られない。** 一覧を開いた
 *    ときに期間内の各月へ展開される。したがって:
 *      - **金額を変えると過去の月まで遡って変わる**
 *      - **削除すると過去の月からも消える**
 *    「今月から上がった」「先月でやめた」は**終了月を入れて終わらせる**ことで表す。
 *    画面にもその案内を出している。
 *
 * ⚠️ **支払日は 1〜28 まで。** 29〜31 は存在しない月があり、その月だけ
 *    計上が飛ぶ（サーバと DB の CHECK でも弾いている）。
 */
export default function RecurringExpensesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();

  const { data, isLoading, isRefetching, refetch, error } = useRecurringExpenses();
  const stores = useStores();
  const create = useCreateRecurringExpense();
  const update = useUpdateRecurringExpense();
  const remove = useDeleteRecurringExpense();

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [day, setDay] = useState("1");
  const [storeId, setStoreId] = useState("");

  const items = data ?? [];
  const isOffline = error instanceof ApiError && error.code === "OFFLINE";
  const amountValue = Number(amount);
  const dayValue = Number(day);
  const canSubmit =
    name.trim() !== "" &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    Number.isInteger(dayValue) &&
    dayValue >= 1 &&
    dayValue <= 28 &&
    !create.isPending;

  const storeOptions = [
    { value: "", label: "組織全体（店舗に紐づけない）" },
    ...(stores.data ?? []).map((s) => ({ value: s.id, label: `${s.store}店` })),
  ];

  function resetForm() {
    setName("");
    setAmount("");
    setCategory(DEFAULT_CATEGORY);
    setDay("1");
    setStoreId("");
  }

  function onAdd() {
    create.mutate(
      {
        storeId: storeId === "" ? null : storeId,
        name: name.trim(),
        amount: amountValue,
        category,
        dayOfMonth: dayValue,
        // ⚠️ 既定は今月から。過去に遡らせない（遡らせると過去の集計が急に変わる）
        startMonth: monthKey(currentMonthIndex()),
        endMonth: null,
      },
      {
        onSuccess: (created) => {
          resetForm();
          setFormOpen(false);
          toast.success(`${created.name} を追加しました`);
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "追加できませんでした"),
      }
    );
  }

  /** 「終わらせる」＝ 終了月を先月にする。⚠️ 削除と違い、これまでの計上は残る */
  async function onEnd(item: RecurringExpense) {
    const previous = monthKey(currentMonthIndex() - 1);
    const ok = await dialog.confirm({
      title: `${item.name} を終わらせますか？`,
      message: `${previous} までは計上されたまま残り、今月からは計上されなくなります。`,
      confirmLabel: "終わらせる",
      cancelLabel: "やめる",
    });
    if (!ok) return;

    update.mutate(
      {
        id: item.id,
        storeId: item.laundryId,
        name: item.name,
        amount: item.amount,
        category: item.category,
        dayOfMonth: item.dayOfMonth,
        startMonth: item.startMonth,
        endMonth: previous,
      },
      {
        onSuccess: () => toast.success("終了月を設定しました"),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "変更できませんでした"),
      }
    );
  }

  async function onRemove(item: RecurringExpense) {
    const ok = await dialog.confirm({
      title: `${item.name} を削除しますか？`,
      // ⚠️ ここを曖昧にしない。過去の集計が変わることを必ず伝える
      message:
        "これまで計上されていた分も、すべての月からまとめて消えます。過去の記録を残したい場合は「終わらせる」を使ってください。",
      confirmLabel: "削除する",
      cancelLabel: "やめる",
      destructive: true,
    });
    if (!ok) return;

    remove.mutate(item.id, {
      onSuccess: () => toast.success("削除しました"),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "削除できませんでした"),
    });
  }

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle}>毎月の固定費</Text>
        <View style={styles.headerButton} />
      </View>

      {isLoading && !data ? (
        <CenterMessage text="読み込み中…" />
      ) : isOffline && !data ? (
        <CenterMessage text="オフラインです" />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl,
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={color.teal} />
          }
        >
          <Muted style={styles.lead}>
            家賃や水道光熱費のように毎月かかるものを登録しておくと、経費の一覧に自動で計上されます。
          </Muted>

          {items.length === 0 ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Muted>まだ登録されていません</Muted>
            </Card>
          ) : (
            items.map((item) => (
              <Card key={item.id} style={{ marginTop: spacing.lg }}>
                <View style={styles.itemHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Muted style={styles.itemMeta}>
                      {item.category}　毎月 {item.dayOfMonth} 日
                      {item.laundryId
                        ? `　${(stores.data ?? []).find((s) => s.id === item.laundryId)?.store ?? "店舗"}店`
                        : "　組織全体"}
                    </Muted>
                    <Muted style={styles.itemMeta}>
                      {item.startMonth} 〜 {item.endMonth ?? "継続中"}
                    </Muted>
                  </View>
                  <Text style={styles.itemAmount}>¥{item.amount.toLocaleString()}</Text>
                </View>

                <View style={styles.itemActions}>
                  {/* ⚠️ 継続中のものだけ「終わらせる」を出す。既に終わっているものに出すと
                         押しても何も変わらないボタンになる */}
                  {item.endMonth === null && (
                    <Pressable
                      onPress={() => void onEnd(item)}
                      disabled={update.isPending}
                      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.actionText}>今月で終わらせる</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => void onRemove(item)}
                    disabled={remove.isPending}
                    style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={[styles.actionText, { color: color.red400 }]}>削除</Text>
                  </Pressable>
                </View>
              </Card>
            ))
          )}

          {formOpen ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={styles.sectionTitle}>固定費を追加</Text>

              <Field label="名前">
                <Input value={name} onChangeText={setName} placeholder="例) 家賃" maxLength={40} />
              </Field>

              <Field label="金額（円）">
                <Input
                  value={amount}
                  onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  placeholder="0"
                  style={numeric}
                />
              </Field>

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
                ⚠️ 今月から計上されます。金額を変えると過去の月にも反映されるため、
                途中で金額が変わったときは「今月で終わらせる」を押してから新しく追加してください。
              </Muted>

              {create.error && (
                <FormError
                  message={
                    create.error instanceof ApiError ? create.error.message : "追加できませんでした"
                  }
                />
              )}

              <Button
                label="追加する"
                variant="gradient"
                loading={create.isPending}
                disabled={!canSubmit}
                onPress={onAdd}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : (
            <Button
              label="固定費を追加"
              variant="gradient"
              icon="add"
              onPress={() => setFormOpen(true)}
              style={{ marginTop: spacing.lg }}
            />
          )}
        </ScrollView>
      )}
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
  lead: { fontSize: 13, lineHeight: 20 },
  sectionTitle: {
    fontFamily: font.uiBold,
    fontSize: 13,
    color: color.tealDeeper,
    marginBottom: spacing.sm,
  },
  itemHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  itemName: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  itemMeta: { fontSize: 11, marginTop: 2 },
  itemAmount: { ...numeric, fontSize: 17, color: color.tealDeeper },
  itemActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
    paddingTop: spacing.sm,
  },
  action: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md },
  actionText: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
  note: { fontSize: 11, lineHeight: 17, marginTop: spacing.sm },
});
