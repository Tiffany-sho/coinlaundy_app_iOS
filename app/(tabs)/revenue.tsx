import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFundList, useMonthlySummary, useStoreRevenue } from "@/api/queries";
import { useOutbox } from "@/offline/OutboxProvider";
import { StoreRankBars } from "@/components/revenue/charts";
import { MonthlyRevenueCard } from "@/components/revenue/MonthlyRevenueCard";
import { MonthlySummaryTable } from "@/components/revenue/MonthlySummaryTable";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { Card, CenterMessage, MoneyText, Muted, OfflineBanner, Screen, Title } from "@/components/common/ui";
import { formatJstDate } from "@/shared/date";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { FundListItem } from "@/api/types";

/** グラフカードの切り替えタブ。既定は「月別」（Web も月別売上カードが主役） */
type ChartTab = "store" | "monthly" | "summary";

const CHART_TABS: { value: ChartTab; label: string }[] = [
  { value: "store", label: "店舗別" },
  { value: "monthly", label: "月別" },
  { value: "summary", label: "月次サマリー" },
];

/**
 * 売上履歴の並び順。Web の parts/OrderSelecter.jsx と同じ 4 種類
 * （newer / older / fundsUpper / fundsDown）。
 */
type SortKey = "newest" | "oldest" | "highest" | "lowest";

const SORT_LABELS: Record<SortKey, string> = {
  newest: "新しい順",
  oldest: "古い順",
  highest: "売上が高い順",
  lowest: "売上が低い順",
};

const SORT_ORDER: SortKey[] = ["newest", "oldest", "highest", "lowest"];

/** 「すべての担当者」を表す番兵。ダイアログは null をキャンセルに使うので別の値が要る */
const ALL_COLLECTERS = "__ALL_COLLECTERS__";

/** 退会済みで profiles が引けない集金の表示名（Web も同じ扱い） */
const UNKNOWN_COLLECTER = "退会済みユーザー";

/**
 * 履歴の初期表示と「さらに表示」1 回ぶんの月数。
 * 全部並べると数百件がひと続きになって、目的の月まで延々スクロールすることになる。
 */
const MONTHS_PER_PAGE = 3;

/**
 * 収益。Web の CoinDataList.jsx と同じ内容を 1 画面に収める。
 *   総額収益 → 切り替えカード（店舗別 / 月別 / 月次サマリー）→ 売上履歴
 *
 * Web は PC 幅で 2 列に並べて 3 枚を同時に見せているが、スマホ幅では縦に積むと
 * 履歴まで遠くなる。タブで 1 枚だけ出す形にして、履歴を常に手前に置く。
 * 履歴が数千件になり得るので FlashList の ListHeaderComponent に上部をまとめている。
 */
export default function Revenue() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const { isOnline, pendingCount } = useOutbox();

  const [tab, setTab] = useState<ChartTab>("monthly");
  const [sort, setSort] = useState<SortKey>("newest");
  /** null = 担当者で絞り込まない */
  const [collecter, setCollecter] = useState<string | null>(null);
  /** 折りたたんだ月の見出し。Web の CoinManyDataTable も月ごとに畳める */
  const [collapsed, setCollapsed] = useState<string[]>([]);
  /** 何か月ぶん並べるか。「さらに表示」で MONTHS_PER_PAGE ずつ増やす */
  const [visibleMonths, setVisibleMonths] = useState(MONTHS_PER_PAGE);

  const list = useFundList();
  const monthly = useMonthlySummary();
  const byStore = useStoreRevenue();

  const rows = useMemo(() => list.data?.pages.flat() ?? [], [list.data]);
  const stores = byStore.data ?? [];
  const points = monthly.data ?? [];

  /**
   * 総額収益。
   *
   * ⚠️ 月別売上カードの「集金総額」とは集計範囲が違う。月次サマリー
   *    （/funds/summary/monthly）は前年同月比のために過去 2 年分しか返さないので、
   *    その総和は「全期間」にならない。全期間の総額は店舗別集計
   *    （/funds/summary/stores＝全件を店舗ごとに畳んだもの）の総和で出す。
   */
  const allTimeTotal = stores.reduce((sum, store) => sum + store.total, 0);

  /**
   * 並び替え・絞り込みは読み込み済みのページに対してかける。
   * 途中までしか読んでいない状態で並べ替えると順位も担当者の選択肢も嘘になるので、
   * 既定（新しい順・絞り込みなし）から外れたら残りのページを先に全部取る。
   *
   * ⚠️ BFF 側の getOrgCollectFundsPaginated が 2 か月前の月初以降しか返さないため、
   *    ここで読み切る件数には上限がある（Web の「さらに表示（2か月分）」と同じ範囲）。
   *    本来は /funds が order / asc を受け取れるので、useFundList に渡せれば
   *    サーバ側で並べ替えられる。報告済み。
   */
  const needsFullList = sort !== "newest" || collecter !== null;
  useEffect(() => {
    if (!needsFullList) return;
    // 失敗したら止める。エラーで isFetchingNextPage が落ちる度に呼ぶと無限に再試行する
    if (list.isError || list.isFetchNextPageError) return;
    if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [
    needsFullList,
    list.hasNextPage,
    list.isFetchingNextPage,
    list.isError,
    list.isFetchNextPageError,
    list.fetchNextPage,
  ]);

  /** 担当者の選択肢。実際に集金した人だけを出す（メンバー一覧ではなく実績から作る） */
  const collecterOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const item of rows) seen.add(collecterName(item));
    return [...seen];
  }, [rows]);

  const visible = useMemo(() => {
    const filtered = collecter === null
      ? rows
      : rows.filter((item) => collecterName(item) === collecter);
    const sorted = [...filtered];
    switch (sort) {
      case "newest":
        sorted.sort((a, b) => b.date - a.date);
        break;
      case "oldest":
        sorted.sort((a, b) => a.date - b.date);
        break;
      case "highest":
        sorted.sort((a, b) => b.totalFunds - a.totalFunds);
        break;
      case "lowest":
        sorted.sort((a, b) => a.totalFunds - b.totalFunds);
        break;
    }
    return sorted;
  }, [rows, sort, collecter]);

  /**
   * 履歴の行。日付順のときだけ月の見出しでまとめる。
   * 金額順で月ごとに区切っても意味がないので、そのときは平らな一覧にする
   * （Web の CoinManyDataTable も orderAmount !== "date" ならグループ化しない）。
   */
  /** 日付順のときだけ月でまとめる。金額順で月ごとに区切っても意味がない */
  const isGrouped = sort === "newest" || sort === "oldest";

  // 並び順や担当者を変えたら最初の 3 か月に戻す（前の条件の表示件数を引きずらない）
  useEffect(() => {
    setVisibleMonths(MONTHS_PER_PAGE);
  }, [sort, collecter]);

  const listRows = useMemo<HistoryRow[]>(() => {
    if (!isGrouped) {
      return visible.map((item) => ({ kind: "fund", key: `f:${item.id}`, item }));
    }

    const groups = new Map<string, FundListItem[]>();
    for (const item of visible) {
      const { key } = jstYearMonth(item.date);
      const bucket = groups.get(key);
      if (bucket) bucket.push(item);
      else groups.set(key, [item]);
    }

    const months = [...groups.entries()];
    const shown = months.slice(0, visibleMonths);

    const out: HistoryRow[] = [];
    for (const [month, items] of shown) {
      const isCollapsed = collapsed.includes(month);
      out.push({
        kind: "month",
        key: `m:${month}`,
        month,
        label: jstYearMonth(items[0].date).label,
        count: items.length,
        total: items.reduce((sum, item) => sum + item.totalFunds, 0),
        collapsed: isCollapsed,
      });
      if (isCollapsed) continue;
      for (const item of items) out.push({ kind: "fund", key: `f:${item.id}`, item });
    }

    // 手元にまだ並べていない月があるか、サーバに続きが残っているなら「さらに表示」を出す。
    // ⚠️ /funds は 2 か月前の月初以降しか返さないので、いずれ hasNextPage が false になり
    //    このボタンも消える（無限に押せるわけではない）
    if (months.length > shown.length || list.hasNextPage) {
      out.push({ kind: "more", key: "more", remaining: months.length - shown.length });
    }
    return out;
  }, [visible, isGrouped, collapsed, visibleMonths, list.hasNextPage]);

  function showMoreMonths() {
    setVisibleMonths((n) => n + MONTHS_PER_PAGE);
    // 手元の月を出し切っているなら裏で次のページを取っておく
    if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }

  if (list.isLoading && rows.length === 0 && monthly.isLoading) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  async function pickSort() {
    const picked = await dialog.choose<SortKey>({
      title: "並び替え",
      options: SORT_ORDER.map((key) => ({
        label: SORT_LABELS[key],
        value: key,
        selected: key === sort,
      })),
    });
    if (picked) setSort(picked);
  }

  async function pickCollecter() {
    const picked = await dialog.choose<string>({
      title: "集金担当者で絞り込む",
      message:
        collecterOptions.length === 0 ? "表示できる集金データがありません" : undefined,
      options: [
        { label: "すべての担当者", value: ALL_COLLECTERS, selected: collecter === null },
        ...collecterOptions.map((name) => ({
          label: name,
          value: name,
          selected: collecter === name,
        })),
      ],
    });
    if (picked === null) return;
    setCollecter(picked === ALL_COLLECTERS ? null : picked);
  }

  async function refreshAll() {
    const results = await Promise.all([list.refetch(), monthly.refetch(), byStore.refetch()]);
    // 引っ張って更新したのに古い数字のままだと気づけないので、失敗だけ知らせる
    if (results.some((result) => result.isError)) {
      toast.error("最新のデータを取得できませんでした");
    }
  }

  return (
    <Screen>
      {!isOnline && <OfflineBanner />}
      <FlashList
        data={listRows}
        keyExtractor={(row) => row.key}
        // 見出しと明細で高さが違うので FlashList に種類を教える（使い回しの精度が上がる）
        getItemType={(row) => row.kind}
        /* タブバーは重ならず下に並ぶので insets.bottom は足さない（店舗詳細と同じ理由）。
           最終行がタブバーの境界線に張り付かないよう余白だけ確保する */
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: spacing.xxl,
        }}
        onEndReachedThreshold={0.5}
        /* 月でまとめているときは「さらに表示」が読み込みの起点になる。
           末尾到達でも取ってしまうと、3 か月しか出していないのに全ページ取りに行く */
        onEndReached={
          isGrouped
            ? undefined
            : () => {
                if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
              }
        }
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => void refreshAll()}
            tintColor={color.teal}
          />
        }
        ListHeaderComponent={
          <View>
            <Title style={{ marginBottom: spacing.md, fontSize: 22 }}>収益</Title>

            {pendingCount > 0 && (
              <Pressable onPress={() => router.push("/")} style={styles.badge}>
                <Text style={styles.badgeText}>未送信 {pendingCount} 件</Text>
              </Pressable>
            )}

            <TotalRevenueCard
              total={allTimeTotal}
              storeCount={stores.length}
              firstMonth={points[0]?.month}
              lastMonth={points[points.length - 1]?.month}
              /* 過去 2 年ぶんの総和が全期間の総額に届かない＝それより前にも集金がある */
              hasOlderThanWindow={
                points.length > 0 &&
                allTimeTotal > points.reduce((sum, point) => sum + point.total, 0)
              }
              latestFundDate={latestDate(rows)}
              isLoading={byStore.isLoading && !byStore.data}
            />

            <SegmentedTabs options={CHART_TABS} value={tab} onChange={setTab} />

            {tab === "store" && (
              <Card style={{ marginBottom: spacing.lg }}>
                <Text style={styles.cardTitle}>店舗別の売上</Text>
                <StoreRankBars data={stores} />
              </Card>
            )}

            {tab === "monthly" && (
              <MonthlyRevenueCard
                stores={stores}
                isLoading={byStore.isLoading && !byStore.data}
              />
            )}

            {/* 月次サマリーはデータが無いと何も描かない（カードごと消える）ので、代わりを出す */}
            {tab === "summary" &&
              (points.length > 0 ? (
                <MonthlySummaryTable data={points} />
              ) : (
                <Card style={{ marginBottom: spacing.lg }}>
                  <Text style={styles.cardTitle}>月次サマリー</Text>
                  <Muted>集計できる月がありません</Muted>
                </Card>
              ))}

            <Text style={styles.sectionTitle}>売上履歴</Text>

            <View style={styles.controlRow}>
              <ControlButton
                icon="swap-vertical"
                label={SORT_LABELS[sort]}
                active={sort !== "newest"}
                onPress={() => void pickSort()}
              />
              <ControlButton
                icon="person-outline"
                label={collecter ?? "担当者"}
                active={collecter !== null}
                onPress={() => void pickCollecter()}
              />
            </View>

            {needsFullList && list.hasNextPage && (
              <Muted style={styles.loadingNote}>読み込み済みの分から並べています…</Muted>
            )}
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Muted>
              {collecter === null
                ? "集金データがありません"
                : `${collecter}の集金データがありません`}
            </Muted>
          </Card>
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator color={color.teal} style={{ marginVertical: spacing.lg }} />
          ) : null
        }
        renderItem={({ item: row }) => {
          if (row.kind === "month") {
            return (
              <MonthHeaderRow
                row={row}
                onPress={() =>
                  setCollapsed((prev) =>
                    prev.includes(row.month)
                      ? prev.filter((m) => m !== row.month)
                      : [...prev, row.month]
                  )
                }
              />
            );
          }
          if (row.kind === "more") {
            return (
              <ShowMoreRow
                remaining={row.remaining}
                loading={list.isFetchingNextPage}
                onPress={showMoreMonths}
              />
            );
          }
          return (
            <FundRow
              item={row.item}
              onPress={() =>
                router.push({ pathname: "/funds/[id]", params: { id: String(row.item.id) } })
              }
            />
          );
        }}
      />
    </Screen>
  );
}

/** 履歴の 1 行。月の見出しと集金 1 件が同じリストに混ざる */
type HistoryRow =
  | {
      kind: "month";
      key: string;
      /** "2026-07" 形式。折りたたみの管理キー */
      month: string;
      label: string;
      count: number;
      total: number;
      collapsed: boolean;
    }
  | { kind: "fund"; key: string; item: FundListItem }
  /** 末尾の「さらに表示」。remaining は手元にあってまだ並べていない月の数 */
  | { kind: "more"; key: string; remaining: number };

/**
 * 総額収益。Web の StoreRevenueChart にある「全店舗累計」に当たる。
 * 期間の切り替えに関係なく変わらない数字なので、タブの外（常時表示）に置く。
 *
 * ⚠️ 期間の表示は月単位。金額は全期間（/funds/summary/stores）だが、
 *    日付を持つ集計は月次（/funds/summary/monthly＝過去 2 年）しかなく、
 *    しかも月単位に畳まれているため「最初の集金日」を日まで特定できない。
 *    2 年より前にも集金がある場合は総額と月次の総和がずれるので、それを検知して
 *    「〜より前」と濁す。日付まで出すには BFF の対応が要る（報告済み）。
 *    最終集金日だけは売上履歴（日付降順）の先頭から日単位で分かるので添える。
 */
function TotalRevenueCard({
  total,
  storeCount,
  firstMonth,
  lastMonth,
  hasOlderThanWindow,
  latestFundDate,
  isLoading,
}: {
  total: number;
  storeCount: number;
  firstMonth?: string;
  lastMonth?: string;
  hasOlderThanWindow: boolean;
  latestFundDate: number | null;
  isLoading: boolean;
}) {
  const start = firstMonth
    ? `${monthLabel(firstMonth)}${hasOlderThanWindow ? "より前" : ""}`
    : null;
  const end = lastMonth ? monthLabel(lastMonth) : null;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={styles.cardTitle}>総額収益</Text>
      {isLoading ? (
        <ActivityIndicator color={color.teal} style={{ alignSelf: "flex-start" }} />
      ) : (
        <>
          {/* ¥ を分けるのはホームのヒーローだけ（ui.tsx の MoneyText のコメント参照） */}
          <MoneyText value={total} size={30} tone="deeper" />
          {storeCount > 0 && (
            <Muted style={styles.totalCaption}>
              {start && end ? `${start} 〜 ${end}・${storeCount}店舗` : `全期間・${storeCount}店舗の合計`}
            </Muted>
          )}
          {latestFundDate !== null && (
            <Muted style={styles.totalCaption}>
              最終集金日 {formatJstDate(latestFundDate)}
            </Muted>
          )}
        </>
      )}
    </Card>
  );
}

/** 月の見出し。Web の CoinManyDataTable と同じく件数と合計を並べ、タップで畳める */
function MonthHeaderRow({
  row,
  onPress,
}: {
  row: Extract<HistoryRow, { kind: "month" }>;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <View style={styles.monthHeader}>
        <View style={styles.monthIcon}>
          <Ionicons name="calendar" size={16} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.monthLabel}>{row.label}</Text>
          <Text style={styles.monthCount}>{row.count}件</Text>
        </View>
        <MoneyText value={row.total} size={17} tone="deeper" />
        <Ionicons
          name={row.collapsed ? "chevron-down" : "chevron-up"}
          size={16}
          color={color.teal}
          style={{ marginLeft: spacing.sm }}
        />
      </View>
    </Pressable>
  );
}

/**
 * 「さらに表示」。押すたびに 3 か月ぶん増える。
 * 手元に月が残っていなければサーバの続きを取りに行くので、その間はスピナーを出す。
 */
function ShowMoreRow({
  remaining,
  loading,
  onPress,
}: {
  remaining: number;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      style={({ pressed }) => [styles.showMore, pressed && !loading && { opacity: 0.8 }]}
    >
      {loading ? (
        <ActivityIndicator color={color.teal} />
      ) : (
        <>
          <Ionicons name="chevron-down" size={16} color={color.teal} />
          <Text style={styles.showMoreLabel}>
            さらに表示{remaining > 0 ? `（残り${remaining}か月）` : ""}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** 履歴の 1 件。タップで集金の詳細（機種ごとの金額・日付・削除）へ */
function FundRow({ item, onPress }: { item: FundListItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.storeName}>{item.laundryName}店</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{formatJstDate(item.date)}</Text>
              <Text style={styles.metaFaint}>{collecterName(item)}</Text>
            </View>
          </View>
          <MoneyText value={item.totalFunds} size={16} tone="deeper" />
          <Ionicons
            name="chevron-forward"
            size={16}
            color={color.cyan300}
            style={{ marginLeft: spacing.sm }}
          />
        </View>
      </Card>
    </Pressable>
  );
}

/** 並び替え・絞り込みの入口。選択中は teal で塗って効いていることを示す */
function ControlButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.control,
        active && styles.controlActive,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Ionicons name={icon} size={14} color={active ? color.cyan700 : color.textMuted} />
      <Text
        style={[styles.controlLabel, active && styles.controlLabelActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Ionicons name="chevron-down" size={13} color={active ? color.cyan700 : color.textFaint} />
    </Pressable>
  );
}

function collecterName(item: FundListItem): string {
  return item.profiles?.username ?? UNKNOWN_COLLECTER;
}

/** 読み込み済みの中で一番新しい集金日。無ければ null */
function latestDate(rows: FundListItem[]): number | null {
  let latest: number | null = null;
  for (const item of rows) {
    if (latest === null || item.date > latest) latest = item.date;
  }
  return latest;
}

/**
 * epoch（ミリ秒）から JST の年月を出す。
 * ⚠️ 端末 TZ で組むと月末深夜に 1 か月ずれるので、必ず formatJstDate 経由で分解すること。
 */
function jstYearMonth(epochMs: number): { key: string; label: string } {
  const [year, month] = formatJstDate(epochMs).split("/");
  return { key: `${year}-${month.padStart(2, "0")}`, label: `${year}年${Number(month)}月` };
}

/** "2026-07" → "2026年7月" */
function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

const styles = StyleSheet.create({
  cardTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper, marginBottom: spacing.md },
  sectionTitle: { fontFamily: font.uiBold, fontSize: 17, color: color.tealDeeper, marginBottom: spacing.md },
  totalCaption: { fontSize: 12, marginTop: spacing.xs },
  row: { flexDirection: "row", alignItems: "center" },
  storeName: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  metaRow: { flexDirection: "row", gap: spacing.sm, marginTop: 2 },
  meta: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  metaFaint: { fontFamily: font.ui, fontSize: 12, color: color.textFaint },
  controlRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  control: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.divider,
    backgroundColor: color.cardBg,
    maxWidth: "60%",
  },
  controlActive: { borderColor: color.cyan400, backgroundColor: color.cyan50 },
  controlLabel: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, flexShrink: 1 },
  controlLabelActive: { fontFamily: font.uiBold, color: color.cyan700 },
  loadingNote: { fontSize: 11, marginBottom: spacing.md },
  /* 月の区切り。明細カードと同じ幅・同じ角丸だと境目が分からないので、
     左右にはみ出させた帯にして、上に間を空けて前の月と切り離す */
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: color.cyan100,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.cyan200,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  showMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.cyan200,
    backgroundColor: color.cardBg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  showMoreLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
  monthIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: color.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
  monthCount: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 1 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: color.orange500,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.md,
  },
  badgeText: { fontFamily: font.uiBold, fontSize: 12, color: "#FFFFFF" },
});
