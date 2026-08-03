import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ApiError } from "@/api/client";
import {
  useDeleteRecurringExpense,
  useRecurringExpenses,
  useUpdateRecurringExpense,
} from "@/api/queries";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { Card, Muted } from "@/components/common/ui";
import { categoryColor } from "@/components/expenses/categories";
import { scopeLabel } from "@/components/expenses/ExpenseScopeFilter";
import { currentMonthIndex, monthKey } from "@/components/revenue/monthIndex";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { RecurringExpense, Store } from "@/api/types";

/**
 * 毎月の固定費の**設定**。2026-08-03 に専用ページ（`expenses/recurring`）を畳んで
 * 経費画面の中へ移した（「固定費」と「それ以外」で行き先が分かれていたため）。
 *
 * ⚠️ **ここに並ぶのは「定義」で、上の一覧に出るのは「展開された結果」。**
 *    同じものが 2 か所に見えるので、見出しで「設定」だと分かるようにしてある。
 *
 * ⚠️ **金額を変えると過去の月まで遡って変わる。削除すると過去の月からも消える。**
 *    「今月から上がった」は**終了月を入れて終わらせ、新しく追加する。**
 */
export function RecurringSection({
  stores,
  onAdd,
  canEdit,
}: {
  stores: Store[] | undefined;
  onAdd: () => void;
  canEdit: boolean;
}) {
  const dialog = useDialog();
  const toast = useToast();
  const { data, isLoading } = useRecurringExpenses();
  const update = useUpdateRecurringExpense();
  const remove = useDeleteRecurringExpense();

  const items = data ?? [];

  /** 「終わらせる」＝ 終了月を先月にする。⚠️ 削除と違い、これまでの計上は残る */
  async function onEnd(item: RecurringExpense) {
    const previous = monthKey(currentMonthIndex() - 1);
    const ok = await dialog.confirm({
      title: `毎月の${item.category}を終わらせますか？`,
      message: `${previous} までは計上されたまま残り、今月からは計上されなくなります。`,
      confirmLabel: "終わらせる",
      cancelLabel: "やめる",
    });
    if (!ok) return;

    update.mutate(
      {
        id: item.id,
        storeId: item.laundryId,
        /* ⚠️ 名前は入力欄が無いので、既存の値をそのまま返す（Web で付けた名前を消さない） */
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
      title: `毎月の${item.category}を削除しますか？`,
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
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.head}>
        <Ionicons name="repeat" size={16} color={color.tealDeeper} />
        <Text style={styles.title}>毎月の固定費</Text>
        {canEdit && (
          <Pressable onPress={onAdd} hitSlop={8} style={styles.addLink} accessibilityRole="button">
            <Ionicons name="add" size={14} color={color.teal} />
            <Text style={styles.addLabel}>追加</Text>
          </Pressable>
        )}
      </View>

      {isLoading && !data ? (
        <Card style={{ marginTop: spacing.sm }}>
          <Muted>読み込み中…</Muted>
        </Card>
      ) : items.length === 0 ? (
        <Card style={{ marginTop: spacing.sm }}>
          <Muted style={{ fontSize: 12, lineHeight: 18 }}>
            家賃や水道光熱費のように毎月かかるものを登録しておくと、経費の一覧に自動で計上されます。
          </Muted>
        </Card>
      ) : (
        <Card style={{ marginTop: spacing.sm, paddingVertical: spacing.sm }}>
          {items.map((item, i) => (
            <View key={item.id} style={[styles.row, i === items.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={[styles.dot, { backgroundColor: categoryColor(item.category) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.category}</Text>
                {/* ⚠️ Muted は numberOfLines を受け取らない。素の Text にする */}
                <Text style={styles.rowMeta} numberOfLines={1}>
                  毎月 {item.dayOfMonth} 日　{scopeLabel(item.laundryId, stores)}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.startMonth} 〜 {item.endMonth ?? "継続中"}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowAmount}>¥{item.amount.toLocaleString()}</Text>
                {canEdit && (
                  <View style={styles.actions}>
                    {/* ⚠️ 継続中のものだけ「終わらせる」を出す。終わっているものに出すと
                           押しても何も変わらないボタンになる */}
                    {item.endMonth === null && (
                      <Pressable
                        onPress={() => void onEnd(item)}
                        disabled={update.isPending}
                        hitSlop={6}
                        style={({ pressed }) => pressed && { opacity: 0.6 }}
                      >
                        <Text style={styles.actionText}>今月で終わらせる</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => void onRemove(item)}
                      disabled={remove.isPending}
                      hitSlop={6}
                      style={({ pressed }) => pressed && { opacity: 0.6 }}
                    >
                      <Text style={[styles.actionText, { color: color.red400 }]}>削除</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { flex: 1, fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
  addLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.cyan100,
  },
  addLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.teal },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  dot: { width: 8, height: 8, borderRadius: radius.pill, marginTop: 6 },
  rowName: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  rowMeta: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 2 },
  rowRight: { alignItems: "flex-end", gap: 4 },
  rowAmount: { ...numeric, fontSize: 15, color: color.tealDeeper },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionText: { fontFamily: font.uiBold, fontSize: 11, color: color.teal },
});
