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
import { buildMonthGroups, type MonthGroup } from "@/components/expenses/monthGroups";
import { currentMonthIndex, monthLabel, monthStartEpoch } from "@/components/revenue/monthIndex";
import { Card, CenterMessage, Muted, Screen } from "@/components/common/ui";
import { formatJstDate } from "@/shared/date";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { Expense, Store } from "@/api/types";

/**
 * 経費。**単発と毎月の固定費を 1 枚にまとめてある**（2026-08-03）。
 * それまでは `expenses/recurring` が別ページで、同じ「経費」なのに
 * 行き先が 2 つに分かれていた。
 *
 *   絞り込み → 月ごとのカード（円グラフ + 明細）→ さらに見る
 *   → 毎月の固定費（設定）
 *
 * ⚠️ **円グラフは月ごとに出す。** 期間をまとめて 1 枚にすると
 *    「先月は修繕費が重かった」のような**月の癖が平均に溶けて見えなくなる。**
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
  /* ⚠️ 合計も円グラフも絞り込みに追従させる。全体のまま残すと行と数字が食い違う */
  const items = useMemo(() => all.filter((e) => matchesScope(e, scope)), [all, scope]);
  /** 月ごとの塊。⚠️ 経費が無い月も入る（「さらに見る」が効いて見えるように） */
  const groups = useMemo(
    () => buildMonthGroups(items, current - (months - 1), current),
    [items, current, months]
  );

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
          {/* ⚠️ 店舗が 1 軒も無いときは出さない（「すべて」と「組織全体」しか並ばない） */}
          {(stores.data ?? []).length > 0 && (
            <ExpenseScopeFilter stores={stores.data} value={scope} onChange={setScope} />
          )}

          {/*
            月ごとに 1 枚。⚠️ **円グラフは月ごとに出す**（2026-08-03）。
               期間をまとめて 1 枚にすると「先月は修繕費が重かった」のような
               **月の癖が平均に溶けて見えなくなる。**
            ⚠️ **経費が無い月も細く出す。** 落とすと「さらに見る」を押しても
               画面が変わらないことがあり、効いていないように見える。
          */}
          {groups.map((group) => (
            <MonthCard
              key={group.key}
              group={group}
              stores={stores.data}
              emptyNote={
                scope === "all" ? "この月の経費はありません" : "この絞り込みに合う経費はありません"
              }
              onPressItem={(id) =>
                router.push({ pathname: "/revenue/expenses/[id]", params: { id } })
              }
            />
          ))}

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
          {/* ⚠️ どこまで見ているかを必ず出す。月カードだけだと、伸ばした先が
                 「経費が無い」のか「まだ取っていない」のか区別が付かない */}
          <Muted style={styles.periodLabel}>{periodLabel}を表示中</Muted>

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

/**
 * 1 か月ぶんのカード。カテゴリの円グラフ + その月の明細。
 *
 * ⚠️ **合計はドーナツの中央にしか出さない。** 見出しにも出すと、同じ数字が
 *    数センチ離れて 2 回並ぶ。
 * ⚠️ **経費が無い月はカードを細くする**（円グラフも出さない）。
 *    12 か月に伸ばしたときに空のカードが画面を埋めないため。
 */
function MonthCard({
  group,
  stores,
  emptyNote,
  onPressItem,
}: {
  group: MonthGroup;
  stores: Store[] | undefined;
  emptyNote: string;
  onPressItem: (id: string) => void;
}) {
  if (group.items.length === 0) {
    return (
      <Card style={styles.emptyMonth}>
        <Text style={styles.monthLabel}>{group.label}</Text>
        <Muted style={styles.emptyMonthNote}>{emptyNote}</Muted>
      </Card>
    );
  }

  return (
    <Card style={styles.monthCard}>
      <Text style={styles.monthLabel}>{group.label}</Text>

      <View style={{ marginTop: spacing.sm }}>
        <ExpenseCategoryPie expenses={group.items} total={group.total} />
      </View>

      <View style={styles.monthDivider} />

      {group.items.map((expense, i) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          stores={stores}
          last={i === group.items.length - 1}
          onPress={() => onPressItem(expense.id)}
        />
      ))}
    </Card>
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

  periodLabel: { fontSize: 12, textAlign: "center", marginTop: spacing.sm },

  monthCard: { marginTop: spacing.md, paddingBottom: spacing.sm },
  /* ⚠️ 経費の無い月。細くしないと 12 か月ぶんが空カードで埋まる */
  emptyMonth: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  emptyMonthNote: { fontSize: 11 },
  monthLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
  monthDivider: {
    height: 1,
    backgroundColor: color.divider,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
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
