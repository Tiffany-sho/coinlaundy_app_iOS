import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFundHistory, useMonthlySummary, useStoreRevenue } from "@/api/queries";
import { useOutbox } from "@/offline/OutboxProvider";
import { StoreRankBars } from "@/components/revenue/charts";
import { MonthlyRevenueCard } from "@/components/revenue/MonthlyRevenueCard";
import { MonthlySummaryTable } from "@/components/revenue/MonthlySummaryTable";
import { TotalRevenueCard } from "@/components/revenue/TotalRevenueCard";
import { HistoryControls, type HistorySortField } from "@/components/revenue/HistoryControls";
import type { SortDirection } from "@/components/common/SortControls";
import {
  FundRow,
  ListEndRow,
  MonthHeaderRow,
  ShowMoreRow,
} from "@/components/revenue/FundHistoryRows";
import {
  buildHistoryRows,
  collecterName,
  initialLimit,
  latestFundDate,
  limitStep,
  type HistoryRow,
} from "@/components/revenue/historyRows";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { useToast } from "@/components/common/toast";
import { Card, CenterMessage, Muted, OfflineBanner, Screen, Title } from "@/components/common/ui";
import { color, font, radius, spacing } from "@/theme/tokens";

/** グラフカードの切り替えタブ。既定は「月別」（Web も月別売上カードが主役） */
type ChartTab = "store" | "monthly" | "summary";

const CHART_TABS: { value: ChartTab; label: string }[] = [
  { value: "store", label: "店舗別" },
  { value: "monthly", label: "月別" },
  { value: "summary", label: "月次サマリー" },
];

/**
 * 収益。Web の CoinDataList.jsx と同じ内容を 1 画面に収める。
 *   総額収益 → 切り替えカード（店舗別 / 月別 / 月次サマリー）→ 売上履歴
 *
 * Web は PC 幅で 2 列に並べて 3 枚を同時に見せているが、スマホ幅では縦に積むと
 * 履歴まで遠くなる。タブで 1 枚だけ出す形にして、履歴を常に手前に置く。
 * 履歴が数千件になり得るので FlashList の ListHeaderComponent に上部をまとめている。
 *
 * 行の組み立ては components/revenue/historyRows.ts、見た目は同 HistoryRows.tsx。
 * ここはデータ取得と状態、そして並べるだけにする。
 */
export default function Revenue() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { isOnline, pendingCount } = useOutbox();

  const [tab, setTab] = useState<ChartTab>("monthly");
  const [sortField, setSortField] = useState<HistorySortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  /** null = 担当者で絞り込まない */
  const [collecter, setCollecter] = useState<string | null>(null);
  /** 折りたたんだ月の見出し。Web の CoinManyDataTable も月ごとに畳める */
  const [collapsed, setCollapsed] = useState<string[]>([]);
  /**
   * 一度に出す量。日付順なら月数、売上順なら件数。「さらに表示」で増える。
   * ⚠️ これは**表示量**であって取得範囲ではない。並び替えは常に全データが対象。
   */
  const [limit, setLimit] = useState(() => initialLimit(true));

  /**
   * ⚠️ 全期間ぶんを、サーバに並べさせて受け取る。
   *    期間で区切って取ると「売上が高い順」の先頭がその期間の最高額になってしまう。
   */
  const list = useFundHistory({
    order: sortField === "amount" ? "totalFunds" : "date",
    asc: sortDirection === "asc",
  });
  const monthly = useMonthlySummary();
  const byStore = useStoreRevenue();

  const rows = list.data ?? [];
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
   * 月の見出しでまとめるか。
   * ⚠️ 売上順のときは畳まない。高い順に並んだものを月で区切っても区切りが意味を持たない
   *    （Web の CoinManyDataTable も日付順以外ではグループ化しない）。
   */
  const isGrouped = sortField === "date";

  /** 担当者の選択肢。実際に集金した人だけを出す（メンバー一覧ではなく実績から作る） */
  const collecterOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const item of rows) seen.add(collecterName(item));
    return [...seen];
  }, [rows]);

  /**
   * ⚠️ 並べ替えないこと。サーバが期間全体を ORDER BY で並べて返している。
   *    担当者の絞り込みだけは選択肢が手元のデータから作られるのでここでかける。
   */
  const visible = useMemo(
    () =>
      collecter === null ? rows : rows.filter((item) => collecterName(item) === collecter),
    [rows, collecter]
  );

  const listRows = useMemo<HistoryRow[]>(
    () => buildHistoryRows({ items: visible, grouped: isGrouped, collapsed, limit }),
    [visible, isGrouped, collapsed, limit]
  );

  function showMore() {
    setLimit((n) => n + limitStep(isGrouped));
  }

  /**
   * 並び替えの着地点。
   *
   * ⚠️ 並び順を変えると行の構成ごと変わる（売上順は月見出しが無い、日付順はある）ので、
   *    スクロール位置をそのままにすると、同じ座標に**まったく別の行**が来て画面が飛ぶ。
   *    「売上順にしてから日付順に戻すと場所が変わる」のがこれ。
   *    並べ直したら必ず売上履歴の見出しへ戻す。
   *
   * ⚠️ 「さらに表示」では動かさないこと。押した位置に留まりたい操作なので、
   *    下の useEffect の依存に limit を入れない。
   */
  const listRef = useRef<FlashListRef<HistoryRow>>(null);
  /** 売上履歴の見出しがコンテンツ先頭から何 px 下にあるか */
  const historyOffset = useRef(0);
  const mounted = useRef(false);

  /** contentContainerStyle の上余白。ヘッダ内の y に足すとコンテンツ座標になる */
  const contentPaddingTop = insets.top + spacing.lg;

  function onHistoryLayout(e: LayoutChangeEvent) {
    historyOffset.current = contentPaddingTop + Math.round(e.nativeEvent.layout.y);
  }

  useEffect(() => {
    /**
     * ⚠️ limit の単位が並び順で変わる（日付順＝月数 / 売上順＝件数）ので必ず戻すこと。
     *    9 か月ぶん出した状態で売上順に切り替えると、そのままでは 9 件しか出ない。
     */
    setLimit(initialLimit(isGrouped));

    // 初回は測る前に走るうえ、そもそも先頭にいるので動かさない
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    listRef.current?.scrollToOffset({ offset: historyOffset.current, animated: false });
  }, [sortField, sortDirection, collecter, isGrouped]);

  async function refreshAll() {
    const results = await Promise.all([list.refetch(), monthly.refetch(), byStore.refetch()]);
    // 引っ張って更新したのに古い数字のままだと気づけないので、失敗だけ知らせる
    if (results.some((result) => result.isError)) {
      toast.error("最新のデータを取得できませんでした");
    }
  }

  if (list.isLoading && rows.length === 0 && monthly.isLoading) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  return (
    <Screen>
      {!isOnline && <OfflineBanner />}
      <FlashList
        ref={listRef}
        data={listRows}
        keyExtractor={(row) => row.key}
        // 見出しと明細で高さが違うので FlashList に種類を教える（使い回しの精度が上がる）
        getItemType={(row) => row.kind}
        /* タブバーは重ならず下に並ぶので insets.bottom は足さない（店舗詳細と同じ理由）。
           最終行がタブバーの境界線に張り付かないよう余白だけ確保する */
        contentContainerStyle={{
          padding: spacing.lg,
          // ⚠️ onHistoryLayout もこの値を使う。片方だけ変えると着地点がずれる
          paddingTop: contentPaddingTop,
          paddingBottom: spacing.xxl,
        }}
        /* 月でまとめているので、末尾到達では取りに行かない。
           「さらに表示」だけが読み込みの起点（末尾でも取ると 3 か月しか出していないのに
           全ページ取りに行ってしまう） */
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
              countLabel="店舗数"
              countValue={stores.length > 0 ? `${stores.length}店舗` : "—"}
              firstMonth={points[0]?.month}
              lastMonth={points[points.length - 1]?.month}
              /* 過去 2 年ぶんの総和が全期間の総額に届かない＝それより前にも集金がある */
              hasOlderThanWindow={
                points.length > 0 &&
                allTimeTotal > points.reduce((sum, point) => sum + point.total, 0)
              }
              latestFundDate={latestFundDate(rows)}
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
              <MonthlyRevenueCard stores={stores} isLoading={byStore.isLoading && !byStore.data} />
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

            {/* 並び替え後はここへ戻す。y を測るためにひとつの View にまとめてある */}
            <View onLayout={onHistoryLayout}>
              <Text style={styles.sectionTitle}>売上履歴</Text>

              <HistoryControls
                sortField={sortField}
                sortDirection={sortDirection}
                onSortChange={(field, next) => {
                  setSortField(field);
                  setSortDirection(next);
                }}
                collecter={collecter}
                collecterOptions={collecterOptions}
                onCollecterChange={setCollecter}
              />
            </View>

            {/* 並び順を変えた直後。前の並びを出したまま裏で取り直している */}
            {list.isFetching && (
              <Muted style={styles.loadingNote}>並び替えています…</Muted>
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
        /* 取り直し中の表示はヘッダ側に出す。前の期間の一覧はそのまま残る
           （useFundHistory の keepPreviousData） */
        ListFooterComponent={null}
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
                unit={row.unit}
                loading={list.isFetching}
                onPress={showMore}
              />
            );
          }
          if (row.kind === "end") {
            return <ListEndRow fundCount={row.fundCount} />;
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

const styles = StyleSheet.create({
  cardTitle: {
    fontFamily: font.uiBold,
    fontSize: 14,
    color: color.tealDeeper,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: font.uiBold,
    fontSize: 17,
    color: color.tealDeeper,
    marginBottom: spacing.md,
  },
  loadingNote: { fontSize: 11, marginBottom: spacing.md },
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
