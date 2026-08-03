import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap, useExpenses, useStores } from "@/api/queries";
import { ApiError } from "@/api/client";
import { AddExpenseSheet } from "@/components/expenses/AddExpenseSheet";
import { categoryColor } from "@/components/expenses/categories";
import { ExpenseCategoryPie } from "@/components/expenses/ExpenseCategoryPie";
import { expensesEnabled } from "@/components/expenses/expensesEnabled";
import {
  ExpenseScopeFilter,
  matchesScope,
  scopeLabel,
  type ExpenseScope,
} from "@/components/expenses/ExpenseScopeFilter";
import { RecurringFormSheet } from "@/components/expenses/RecurringFormSheet";
import { RecurringSection } from "@/components/expenses/RecurringSection";
import {
  currentMonthIndex,
  monthIndexFromEpoch,
  monthLabel,
  monthStartEpoch,
} from "@/components/revenue/monthIndex";
import { Card, CenterMessage, Muted, Screen } from "@/components/common/ui";
import { formatJstDate } from "@/shared/date";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { Expense, Store } from "@/api/types";

/**
 * 経費。**単発と毎月の固定費を 1 枚にまとめてある**（2026-08-03）。
 * それまでは `expenses/recurring` が別ページで、同じ「経費」なのに
 * 行き先が 2 つに分かれていた。
 *
 *   期間の合計 + カテゴリの円グラフ → 絞り込み → 一覧 → さらに見る
 *   → 毎月の固定費（設定）
 *
 * ⚠️ **一覧には毎月の固定費を展開したものが混ざる**（`recurring: true`）。
 *    実体が無いので**編集・削除の導線を出さない。** 変更は下の「毎月の固定費」から。
 *
 * ⚠️ **期間は必ず切って取る。** 経費は増え続けるので、切らないとサーバ側で
 *    1000 行の上限に当たって古い順から黙って欠ける。
 */

/** 最初に出す月数。⚠️ 当月だけ */
const INITIAL_MONTHS = 1;
/** 「さらに見る」1 回で伸ばす月数 */
const MONTH_STEP = 3;

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const current = currentMonthIndex();
  /**
   * 直近この月数ぶんを見る。⚠️ **月の行き来ではなく「伸ばす」**にしてある。
   *    経費は当月だけ見たい日と、まとめて見返したい日の両方があるため。
   */
  const [months, setMonths] = useState(INITIAL_MONTHS);
  /** ⚠️ "all" が「絞らない」。"org" は `laundry_id` が NULL の行だけ（別物） */
  const [scope, setScope] = useState<ExpenseScope>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);

  const stores = useStores();
  const bootstrap = useBootstrap();

  const from = monthStartEpoch(current - (months - 1));
  /*
    ⚠️ **`to` は「含む」。** `/funds/chart` の to は排他なので**向きが逆**。
       翌月 1 日を渡すと**翌月 1 日の経費が 1 件だけ混ざる**ので、その 1 ミリ秒前にする。
  */
  const to = monthStartEpoch(current + 1) - 1;

  /*
    ⚠️ **絞り込みはサーバに投げず、取ってきた期間ぶんを手元で分ける。**
       API の `storeId` は「その店舗のものだけ」を返すので、
       **「組織全体（laundry_id が NULL）だけ」を取る手段が無い。**
  */
  const { data, isLoading, isRefetching, refetch, error } = useExpenses(from, to);

  const all = data ?? [];
  const items = useMemo(() => all.filter((e) => matchesScope(e, scope)), [all, scope]);
  /* ⚠️ 合計も円グラフも絞り込みに追従させる。全体のまま残すと行と数字が食い違う */
  const total = useMemo(() => items.reduce((sum, e) => sum + (e.amount ?? 0), 0), [items]);
  /** 月の見出しを挟んだ行。⚠️ 複数月を出すので、区切りが無いと日付を読むまで分からない */
  const rows = useMemo(() => buildRows(items), [items]);

  const isOffline = error instanceof ApiError && error.code === "OFFLINE";
  const enabled = expensesEnabled(bootstrap.data?.organization);
  const myRole = bootstrap.data?.organization?.myRole;
  /* ⚠️ 表示の出し分けだけ。実際の可否はサーバが判定して 403 を返す */
  const canEdit = myRole === "admin" || myRole === "collecter";

  const periodLabel =
    months === 1
      ? monthLabel(current)
      : `${monthLabel(current - (months - 1))} 〜 ${monthLabel(current)}`;

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle}>経費</Text>
        {/* ⚠️ 固定費の専用ページは畳んだので、ここにアイコンは置かない */}
        <View style={styles.headerButton} />
      </View>

      {/*
        ⚠️ 設定で経費を切った直後にこの画面に留まっていることがある（入口は消えるが
           開いている画面は閉じない）。空の一覧を出すと壊れたように見えるので明示する。
      */}
      {!enabled ? (
        <CenterMessage
          text={"この組織では経費を記録しない設定です。\n設定 → 組織 から変更できます。"}
        />
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
            <Muted style={styles.periodLabel}>{periodLabel}</Muted>
            {/* ⚠️ 合計は円の中央にも出る。ここでは期間の見出しだけにして重複させない */}
            <View style={{ marginTop: spacing.md }}>
              <ExpenseCategoryPie expenses={items} total={total} />
            </View>
          </Card>

          {/* ⚠️ 店舗が 1 軒も無いときは出さない（「すべて」と「組織全体」しか並ばない） */}
          {(stores.data ?? []).length > 0 && (
            <View style={{ marginTop: spacing.md }}>
              <ExpenseScopeFilter stores={stores.data} value={scope} onChange={setScope} />
            </View>
          )}

          {rows.length === 0 ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Muted>
                {scope === "all"
                  ? "この期間の経費はまだありません"
                  : "この絞り込みに合う経費はありません"}
              </Muted>
            </Card>
          ) : (
            <Card style={{ marginTop: spacing.lg, paddingVertical: spacing.sm }}>
              {rows.map((row, i) =>
                row.kind === "month" ? (
                  <View key={row.key} style={[styles.monthHead, i === 0 && { marginTop: 0 }]}>
                    <Text style={styles.monthHeadLabel}>{row.label}</Text>
                    <Text style={styles.monthHeadTotal}>¥{row.total.toLocaleString()}</Text>
                  </View>
                ) : (
                  <ExpenseRow
                    key={row.key}
                    expense={row.expense}
                    stores={stores.data}
                    last={row.last}
                    onPress={() =>
                      router.push({
                        pathname: "/revenue/expenses/[id]",
                        params: { id: row.expense.id },
                      })
                    }
                  />
                )
              )}
            </Card>
          )}

          {/*
            ⚠️ **「さらに見る」で期間を伸ばす。** 月の行き来（前へ / 次へ）だと
               古い経費に辿り着くまで何度も押すことになり、**まとめて見返せない。**
            ⚠️ 押した位置に留まりたい操作なので、スクロール位置は動かさない。
          */}
          <Pressable
            onPress={() => setMonths((m) => m + MONTH_STEP)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.more, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="chevron-down" size={15} color={color.teal} />
            <Text style={styles.moreLabel}>
              さらに見る（もう{MONTH_STEP}か月）
            </Text>
          </Pressable>

          <RecurringSection
            stores={stores.data}
            canEdit={canEdit}
            onAdd={() => setRecurringOpen(true)}
          />
        </ScrollView>
      )}

      {/* ⚠️ 下端の余白（insets.bottom）を足す。ホームインジケータに重なる。
             ⚠️ **条件の中に入れること。** 外に置くと、記録しない設定でも「＋」が残る */}
      {enabled && canEdit && (
        <Pressable
          onPress={() => setAddOpen(true)}
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

      <AddExpenseSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onChoose={(choice) => {
          if (choice === "once") router.push("/revenue/expenses/new");
          else setRecurringOpen(true);
        }}
      />

      <RecurringFormSheet open={recurringOpen} onClose={() => setRecurringOpen(false)} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* 行の組み立て                                                        */
/* ------------------------------------------------------------------ */

type Row =
  | { kind: "month"; key: string; label: string; total: number }
  | { kind: "item"; key: string; expense: Expense; last: boolean };

/**
 * 月の見出しを挟んで並べる。
 *
 * ⚠️ **サーバは新しい順で返す。並べ直さないこと**（`getExpenses` が
 *    展開した固定費と実体を混ぜてから日付で並べている）。
 * ⚠️ **月の合計は見出しに出す。** 複数月を出すので、画面上の合計だけだと
 *    どの月がいくらか分からない。
 */
function buildRows(items: Expense[]): Row[] {
  const out: Row[] = [];
  let currentKey: number | null = null;

  items.forEach((expense, i) => {
    const index = monthIndexFromEpoch(expense.date);
    if (index !== currentKey) {
      currentKey = index;
      const total = items
        .filter((e) => monthIndexFromEpoch(e.date) === index)
        .reduce((sum, e) => sum + (e.amount ?? 0), 0);
      out.push({ kind: "month", key: `m:${index}`, label: monthLabel(index), total });
    }
    const nextIsSameMonth =
      i + 1 < items.length && monthIndexFromEpoch(items[i + 1]!.date) === index;
    out.push({ kind: "item", key: expense.id, expense, last: !nextIsSameMonth });
  });

  return out;
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
          {/* ⚠️ 固定費の note には名前が入るが、名前を付けなければカテゴリと同じ。
                 同じ語が 2 回並ばないよう、一致するときは出さない */}
          {expense.note && expense.note !== expense.category ? `　${expense.note}` : ""}
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

  periodLabel: { fontSize: 12, textAlign: "center" },

  monthHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.cyan100,
  },
  monthHeadLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.tealDeeper },
  monthHeadTotal: { ...numeric, fontSize: 12, color: color.textMuted },

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

  more: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  moreLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },

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
