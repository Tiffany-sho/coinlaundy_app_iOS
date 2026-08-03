import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap, useExpenses, useStores } from "@/api/queries";
import { ApiError } from "@/api/client";
import { categoryColor } from "@/components/expenses/categories";
import { expensesEnabled } from "@/components/expenses/expensesEnabled";
import {
  ExpenseScopeFilter,
  matchesScope,
  scopeLabel,
  type ExpenseScope,
} from "@/components/expenses/ExpenseScopeFilter";
import { PagerArrow } from "@/components/revenue/ChartPager";
import {
  currentMonthIndex,
  monthLabel,
  monthStartEpoch,
} from "@/components/revenue/monthIndex";
import { Card, CenterMessage, Muted, Screen } from "@/components/common/ui";
import { formatJstDate } from "@/shared/date";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { Expense, Store } from "@/api/types";

/**
 * 経費の一覧。月単位で見る。
 *
 * ⚠️ **毎月の固定費を展開したものが混ざって返る。**（`recurring: true`）
 *    実体が無いので**編集・削除の導線を出さない。** 変更は「固定費の設定」から行う。
 *
 * ⚠️ **期間は必ず切って取る。** 経費は増え続けるので、切らないとサーバ側で
 *    1000 行の上限に当たって古い順から黙って欠ける。
 */
export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const current = currentMonthIndex();
  const [month, setMonth] = useState(current);
  /** ⚠️ "all" が「絞らない」。"org" は `laundry_id` が NULL の行だけ（別物） */
  const [scope, setScope] = useState<ExpenseScope>("all");

  const stores = useStores();
  const bootstrap = useBootstrap();

  /*
    ⚠️ **`to` は「含む」。** `/funds/chart` の to は排他なので**向きが逆**。
       翌月 1 日を渡すと**翌月 1 日の経費が 1 件だけ混ざる**ので、その 1 ミリ秒前にする。
  */
  const from = monthStartEpoch(month);
  const to = monthStartEpoch(month + 1) - 1;

  /*
    ⚠️ **絞り込みはサーバに投げず、取ってきた月ぶんを手元で分ける。**
       API の `storeId` は「その店舗のものだけ」を返すので、
       **「組織全体（laundry_id が NULL）だけ」を取る手段が無い。**
       1 か月ぶんは高々数十件なので、まとめて取ってから分けるほうが確実。
  */
  const { data, isLoading, isRefetching, refetch, error } = useExpenses(from, to);

  const all = data ?? [];
  const items = useMemo(() => all.filter((e) => matchesScope(e, scope)), [all, scope]);
  /* ⚠️ 合計も絞り込みに追従させる。全体の合計のまま残すと行と数字が食い違う */
  const total = useMemo(() => items.reduce((sum, e) => sum + (e.amount ?? 0), 0), [items]);
  const isOffline = error instanceof ApiError && error.code === "OFFLINE";
  const enabled = expensesEnabled(bootstrap.data?.organization);

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle}>経費</Text>
        {/* ⚠️ 記録しない設定のときは入口を出さない（押せるのに使えない状態にしない） */}
        {enabled ? (
          <Pressable
            onPress={() => router.push("/revenue/expenses/recurring")}
            hitSlop={12}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="毎月の固定費の設定"
          >
            <Ionicons name="repeat" size={22} color={color.teal} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      {/*
        ⚠️ 設定で経費を切った直後にこの画面に留まっていることがある（入口は消えるが
           開いている画面は閉じない）。空の一覧を出すと壊れたように見えるので明示する。
      */}
      {!enabled ? (
        <CenterMessage text={"この組織では経費を記録しない設定です。\n設定 → 組織 から変更できます。"} />
      ) : isLoading && !data ? (
        <CenterMessage text="読み込み中…" />
      ) : isOffline && !data ? (
        <CenterMessage text="オフラインです" />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl * 2,
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={color.teal} />
          }
        >
          <Card>
            <View style={styles.monthRow}>
              <PagerArrow direction={-1} disabled={false} onPress={() => setMonth((m) => m - 1)} />
              <View style={{ flex: 1 }}>
                <Muted style={styles.monthLabel}>{monthLabel(month)}</Muted>
                <Text style={styles.monthTotal}>¥{total.toLocaleString()}</Text>
              </View>
              {/* ⚠️ 未来の月は見せない。空の月を無限にめくれてしまう */}
              <PagerArrow
                direction={1}
                disabled={month >= current}
                onPress={() => setMonth((m) => m + 1)}
              />
            </View>
          </Card>

          {/* ⚠️ 店舗が 1 軒も無いときは出さない（「すべて」と「組織全体」しか並ばない） */}
          {(stores.data ?? []).length > 0 && (
            <View style={{ marginTop: spacing.md }}>
              <ExpenseScopeFilter stores={stores.data} value={scope} onChange={setScope} />
            </View>
          )}

          {items.length === 0 ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Muted>
                {scope === "all"
                  ? "この月の経費はまだありません"
                  : "この絞り込みに合う経費はありません"}
              </Muted>
            </Card>
          ) : (
            <Card style={{ marginTop: spacing.lg, paddingVertical: spacing.sm }}>
              {items.map((expense, i) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  stores={stores.data}
                  last={i === items.length - 1}
                  onPress={() =>
                    router.push({
                      pathname: "/revenue/expenses/[id]",
                      params: { id: expense.id },
                    })
                  }
                />
              ))}
            </Card>
          )}
        </ScrollView>
      )}

      {/* ⚠️ 下端の余白（insets.bottom）を足す。ホームインジケータに重なる。
             ⚠️ **条件の中に入れること。** 外に置いていたので、記録しない設定でも
                「＋」だけが浮いて残っていた */}
      {enabled && (
        <Pressable
          onPress={() => router.push("/revenue/expenses/new")}
          accessibilityRole="button"
          accessibilityLabel="経費を追加"
          style={({ pressed }) => [
            styles.fab,
            { bottom: insets.bottom + spacing.lg },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="add" size={26} color="#FFFFFF" />
        </Pressable>
      )}
    </Screen>
  );
}

function ExpenseRow({
  expense,
  stores,
  last,
  onPress,
}: {
  expense: Expense;
  stores: Store[] | undefined;
  last: boolean;
  onPress: () => void;
}) {
  /*
    ⚠️ **展開された固定費は押しても編集画面へ行かない。** id が実在せず、
       サーバも 400 で弾く。行ごと押せなくして「押したのに何も起きない」を防ぐ。
  */
  const isRecurring = expense.recurring === true;

  const body = (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <View style={[styles.dot, { backgroundColor: categoryColor(expense.category) }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.rowHead}>
          <Text style={styles.rowCategory}>{expense.category}</Text>
          {isRecurring && (
            <View style={styles.recurringBadge}>
              <Ionicons name="repeat" size={10} color={color.tealDeeper} />
              <Text style={styles.recurringBadgeText}>毎月</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {/* ⚠️ 対象（店舗 / 組織全体）を必ず出す。同じ金額・同じカテゴリの行が
                 店舗ごとに並ぶので、無いとどれがどの店舗か区別が付かない */}
          {formatJstDate(expense.date)}　{scopeLabel(expense.laundryId, stores)}
          {expense.note ? `　${expense.note}` : ""}
        </Text>
      </View>
      <Text style={styles.rowAmount}>¥{(expense.amount ?? 0).toLocaleString()}</Text>
      {!isRecurring && <Ionicons name="chevron-forward" size={14} color={color.cyan300} />}
    </View>
  );

  if (isRecurring) return body;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {body}
    </Pressable>
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

  monthRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  monthLabel: { fontSize: 12, textAlign: "center" },
  monthTotal: {
    ...numeric,
    fontSize: 26,
    color: color.tealDeeper,
    textAlign: "center",
    marginTop: 2,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  rowHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  rowCategory: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  rowMeta: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, marginTop: 2 },
  rowAmount: { ...numeric, fontSize: 15, color: color.tealDeeper },
  recurringBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: color.tealPale,
    borderRadius: radius.md,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  recurringBadgeText: { fontFamily: font.uiBold, fontSize: 10, color: color.tealDeeper },

  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: color.teal,
    alignItems: "center",
    justifyContent: "center",
    /* ⚠️ 影と overflow:"hidden" を同じ View に置かない（iOS で影が消える）。
          ここは clip していないので安全 */
    shadowColor: "#0F172A",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
