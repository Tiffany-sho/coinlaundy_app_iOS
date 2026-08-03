import { useState } from "react";
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
import { ChartPager, PagerArrow } from "@/components/revenue/ChartPager";
import {
  currentMonthIndex,
  monthKey,
  monthLabel,
  monthStartEpoch,
  type MonthIndex,
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
 *   絞り込み → 月（横に払って送る。円グラフ + 明細）→ 毎月の固定費（設定）
 *
 * ⚠️ **月は横スライドで送る。** 縦に積むと 12 か月ぶんが縦一列になり、
 *    下の「毎月の固定費」まで遠くなる。仕組みは月別売上と同じ `ChartPager`。
 *    ⚠️ **`ScrollView` で作り直さないこと**（`docs/traps.md` の react-native-web）。
 *    ⚠️ **戻るジェスチャに奪われないよう `_layout.tsx` が
 *       `fullScreenGestureEnabled: false` にしている。外さないこと。**
 *
 * ⚠️ **円グラフは月ごと。** 期間をまとめて 1 枚にすると
 *    「先月は修繕費が重かった」のような**月の癖が平均に溶けて見えなくなる。**
 *
 * ⚠️ **一覧には毎月の固定費を展開したものが混ざる**（`recurring: true`）。
 *    実体が無いので**編集・削除の導線を出さない。** 変更は下の「毎月の固定費」から。
 */
export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const current = currentMonthIndex();
  const [month, setMonth] = useState<MonthIndex>(current);
  /** ⚠️ "all" が「絞らない」。"org" は `laundry_id` が NULL の行だけ（別物） */
  const [scope, setScope] = useState<ExpenseScope>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);

  const stores = useStores();
  const bootstrap = useBootstrap();

  /* ⚠️ 未来の月は見せない。空の月を無限にめくれてしまう */
  const canNext = month < current;
  /*
    ⚠️ **過去に下限は設けない。** 「最初の経費がいつか」を返す API が無く、
       集金の最古月で代用すると**それより前に入れた経費に辿り着けなくなる。**
  */
  const canPrev = true;

  /*
    前後の月も先に取っておく。⚠️ **取らないと、指で引いている最中に隣の月が
    空で描かれ、送りきった瞬間に中身が現れる。**
    ⚠️ react-query のキャッシュに月ごとに乗るので、行き来しても取り直さない。
  */
  const currentQuery = useMonthExpenses(month, true);
  const prevQuery = useMonthExpenses(month - 1, true);
  const nextQuery = useMonthExpenses(month + 1, canNext);

  const isOffline =
    currentQuery.error instanceof ApiError && currentQuery.error.code === "OFFLINE";
  const enabled = expensesEnabled(bootstrap.data?.organization);
  const myRole = bootstrap.data?.organization?.myRole;
  /*
    ⚠️ **表示の出し分けだけ。実際の可否はサーバが判定して 403 を返す。**

    ⚠️ **「足せる人」と「直せる人」が違う**（2026-08-03）。
       - 単発の登録 … admin + 集金担当者（現場で出た支出をその場で記録するため）
       - 編集・削除・固定費の管理 … **admin だけ**
       まとめて 1 つの `canEdit` にしないこと。**混ぜると集金担当者に
       押しても 403 になるボタンが出る。**
  */
  const isAdmin = myRole === "admin";
  const canAdd = isAdmin || myRole === "collecter";

  const emptyNote =
    scope === "all" ? "この月の経費はありません" : "この絞り込みに合う経費はありません";

  const pane = (query: ReturnType<typeof useMonthExpenses>) => (
    <MonthPane
      items={(query.data ?? []).filter((e) => matchesScope(e, scope))}
      loading={query.isLoading && !query.data}
      stores={stores.data}
      emptyNote={emptyNote}
      /* ⚠️ 編集できない人には行を押させない（押しても 403 になる画面へ行くだけ） */
      onPressItem={
        isAdmin
          ? (id) => router.push({ pathname: "/revenue/expenses/[id]", params: { id } })
          : null
      }
    />
  );

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
      ) : isOffline && !currentQuery.data ? (
        <CenterMessage text="オフラインです" />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl * 2,
          }}
          refreshControl={
            <RefreshControl
              refreshing={currentQuery.isRefetching}
              onRefresh={currentQuery.refetch}
              tintColor={color.teal}
            />
          }
        >
          {/* ⚠️ 店舗が 1 軒も無いときは出さない（「すべて」と「組織全体」しか並ばない） */}
          {(stores.data ?? []).length > 0 && (
            <ExpenseScopeFilter stores={stores.data} value={scope} onChange={setScope} />
          )}

          <Card style={{ marginTop: spacing.md }}>
            {/*
              月の送り。払っても送れるが、**矢印も必ず出す。**
              ⚠️ ジェスチャだけにすると気づかれないうえ、**VoiceOver から操作できない。**
            */}
            <View style={styles.monthNav}>
              <PagerArrow
                direction={-1}
                disabled={!canPrev}
                onPress={() => setMonth((m) => m - 1)}
              />
              <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
              <PagerArrow
                direction={1}
                disabled={!canNext}
                onPress={() => setMonth((m) => m + 1)}
              />
            </View>

            {/*
              ⚠️ 3 面まとめて描く。指で引いている最中に隣の月が見えるようにするため。
                 ⚠️ **端では隣を描かない**（`canNext`）。描くと存在しない未来の月が
                    覗いて「まだ先がある」ように見える。
            */}
            <ChartPager
              pageKey={monthKey(month)}
              canPrev={canPrev}
              canNext={canNext}
              onPage={(direction) => setMonth((m) => m + direction)}
              prev={canPrev ? pane(prevQuery) : null}
              current={pane(currentQuery)}
              next={canNext ? pane(nextQuery) : null}
            />
          </Card>

          {/* ⚠️ 固定費の管理は admin だけ（追加・終了・削除。理由はサーバの requireAdmin） */}
          <RecurringSection
            stores={stores.data}
            canEdit={isAdmin}
            onAdd={() => setRecurringOpen(true)}
          />
        </ScrollView>
      )}

      {/* ⚠️ 下端の余白（insets.bottom）を足す。ホームインジケータに重なる。
             ⚠️ **条件の中に入れること。** 外に置くと、記録しない設定でも「＋」が残る */}
      {enabled && canAdd && (
        <Pressable
          /*
            ⚠️ **集金担当者には 2 択を出さない。** 固定費は admin だけなので、
               出すと片方が必ず 403 になる。選ぶものが 1 つしか無いなら
               シートを挟まず単発の入力へ直行させる。
          */
          onPress={() => {
            if (isAdmin) setAddOpen(true);
            else router.push("/revenue/expenses/new");
          }}
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

      {/* ⚠️ どちらも admin 専用。開く経路が無くても、置いたままにしない */}
      {isAdmin && (
        <>
          <AddExpenseSheet
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onChoose={(choice) => {
              if (choice === "once") router.push("/revenue/expenses/new");
              else setRecurringOpen(true);
            }}
          />

          <RecurringFormSheet open={recurringOpen} onClose={() => setRecurringOpen(false)} />
        </>
      )}
    </Screen>
  );
}

/**
 * 1 か月ぶんの経費。
 *
 * ⚠️ **`to` は「含む」。** `/funds/chart` の `to` は排他なので**向きが逆**。
 *    翌月 1 日を渡すと**翌月 1 日の経費が 1 件だけ混ざる**ので、その 1 ミリ秒前にする。
 * ⚠️ **月ごとに 1 本ずつ引く。** まとめて引いて手元で分けることもできるが、
 *    月ごとなら react-query のキャッシュがそのまま前後の先読みになる。
 */
function useMonthExpenses(month: MonthIndex, enabled: boolean) {
  return useExpenses(monthStartEpoch(month), monthStartEpoch(month + 1) - 1, undefined, enabled);
}

/**
 * 送りの 1 面。カテゴリの円グラフ + その月の明細。
 *
 * ⚠️ **月の名前を中に置かない。** カードの見出し（送りの矢印の間）が持っている。
 *    両方に出すと、指で引いている最中に同じ月名が 2 つ並んで見える。
 * ⚠️ **合計はドーナツの中央にしか出さない**（見出しにも出すと同じ数字が 2 回並ぶ）。
 */
function MonthPane({
  items,
  loading,
  stores,
  emptyNote,
  onPressItem,
}: {
  items: Expense[];
  loading: boolean;
  stores: Store[] | undefined;
  emptyNote: string;
  /** ⚠️ `null` = 編集できない人。行を押せなくする（403 の画面へ送らないため） */
  onPressItem: ((id: string) => void) | null;
}) {
  if (loading) return <Muted style={styles.paneNote}>読み込み中…</Muted>;
  if (items.length === 0) return <Muted style={styles.paneNote}>{emptyNote}</Muted>;

  /* ⚠️ 数値であることまで確かめる（永続キャッシュで項目が欠けると NaN になる） */
  const total = items.reduce((sum, e) => sum + (Number.isFinite(e?.amount) ? e.amount : 0), 0);

  return (
    <View>
      <ExpenseCategoryPie expenses={items} total={total} />
      <View style={styles.paneDivider} />
      {items.map((expense, i) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          stores={stores}
          last={i === items.length - 1}
          onPress={onPressItem ? () => onPressItem(expense.id) : null}
        />
      ))}
    </View>
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
  onPress: (() => void) | null;
}) {
  /*
    ⚠️ **展開された固定費は押しても編集画面へ行かない。** id が実在せず、
       サーバも 400 で弾く。行ごと押せなくして「押したのに何も起きない」を防ぐ。
    ⚠️ **集金担当者・閲覧者も同じく押せない**（`onPress` が null）。
       編集は admin だけなので、押せると 403 になる画面へ送ることになる。
  */
  const isRecurring = expense.recurring === true;
  const pressable = !isRecurring && onPress !== null;

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
          {formatJstDate(expense.date)}　{scopeLabel(expense, stores)}
          {/* ⚠️ 固定費の note には名前が入るが、名前を付けなければカテゴリと同じ。
                 同じ語が 2 回並ばないよう、一致するときは出さない */}
          {expense.note && expense.note !== expense.category ? `　${expense.note}` : ""}
        </Text>
      </View>
      <Text style={styles.rowAmount}>¥{(expense.amount ?? 0).toLocaleString()}</Text>
      {/* ⚠️ 矢印は押せる行にだけ出す。出したまま押せなくすると壊れて見える */}
      {pressable && <Ionicons name="chevron-forward" size={14} color={color.cyan300} />}
    </View>
  );

  if (!pressable) return body;

  return (
    <Pressable onPress={onPress ?? undefined} style={({ pressed }) => pressed && { opacity: 0.7 }}>
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

  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  monthLabel: {
    flex: 1,
    textAlign: "center",
    fontFamily: font.uiBold,
    fontSize: 15,
    color: color.tealDeeper,
  },
  /* ⚠️ 送りの 3 面は高さが揃う（一番高い月に合わせて伸びる）。短い月の下に
        余白が出るが、面ごとに高さが変わると送るたびに下の「毎月の固定費」が
        跳ねるので、こちらを取っている */
  paneNote: { fontSize: 12, textAlign: "center", paddingVertical: spacing.xl },
  paneDivider: {
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
