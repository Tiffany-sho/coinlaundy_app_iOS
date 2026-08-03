import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { Expense, Store } from "@/api/types";

/**
 * 経費を「どこの支出か」で絞る。
 *
 * ⚠️ **`null` は「組織全体」であって「絞らない」ではない。** `laundry_id` が
 *    NULL の行（税理士費用など店舗に紐づかない支出）がそれ。
 *    絞らない状態は `"all"` という別の値で表す。
 *    ⚠️ ここを `null` で兼ねると、**組織全体の経費だけを見る手段が消える。**
 */
export type ExpenseScope = "all" | "org" | { storeId: string };

export function scopeKey(scope: ExpenseScope): string {
  if (scope === "all" || scope === "org") return scope;
  return scope.storeId;
}

/** その経費が今の絞り込みに入るか */
export function matchesScope(expense: Expense, scope: ExpenseScope): boolean {
  if (scope === "all") return true;
  if (scope === "org") return expense.laundryId === null || expense.laundryId === undefined;
  return expense.laundryId === scope.storeId;
}

/**
 * 一覧の行に出す「対象」。
 *
 * ⚠️ **サーバが焼き込んだ `laundryName` を最優先する。** 店舗一覧（`useStores`）は
 *    担当店舗（011）で絞られるので、集金担当者・閲覧者では**担当外の店舗が
 *    落ちる。** 経費は担当店舗で絞っていないため、一覧から引くと
 *    **担当外の店舗が全部「（削除された店舗）」になる**（実際にそうなっていた）。
 *
 * ⚠️ **`laundryName` を返す前のサーバ・キャッシュでは `undefined`。**
 *    そのときだけ店舗一覧に落として、見つからなければ
 *    **「（削除された店舗）」ではなく「他の店舗」**と出す
 *    （消えたのか担当外なのか区別が付かないので、消えたと言い切らない）。
 */
export function scopeLabel(
  item: { laundryId?: string | null; laundryName?: string | null },
  stores: Store[] | undefined
): string {
  if (!item.laundryId) return "組織全体";

  // サーバが解決済み。null = その店舗はもう存在しない
  if (item.laundryName !== undefined) {
    return item.laundryName ? `${item.laundryName}店` : "（削除された店舗）";
  }

  const found = (stores ?? []).find((s) => s.id === item.laundryId);
  return found ? `${found.store}店` : "他の店舗";
}

/**
 * 絞り込みのチップ。
 *
 * ⚠️ **横に流す。** 店舗が 10 軒あると折り返しで 3 行になり、一覧が下へ押し出される。
 */
export function ExpenseScopeFilter({
  stores,
  value,
  onChange,
}: {
  stores: Store[] | undefined;
  value: ExpenseScope;
  onChange: (scope: ExpenseScope) => void;
}) {
  const options: { key: string; label: string; scope: ExpenseScope }[] = [
    { key: "all", label: "すべて", scope: "all" },
    { key: "org", label: "組織全体", scope: "org" },
    ...(stores ?? []).map((store) => ({
      key: store.id,
      label: `${store.store}店`,
      scope: { storeId: store.id } as ExpenseScope,
    })),
  ];

  const current = scopeKey(value);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((option) => {
        const on = option.key === current;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(option.scope);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.75 }]}
          >
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, paddingVertical: 2 },
  chip: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.cyan100,
    backgroundColor: color.cardBg,
  },
  chipOn: { backgroundColor: color.teal, borderColor: color.teal },
  label: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  labelOn: { fontFamily: font.uiBold, color: "#FFFFFF" },
});
