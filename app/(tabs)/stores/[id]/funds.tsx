import { useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFundHistory, useMonthlySummary, useStore, useStoreRevenue } from "@/api/queries";
import { StoreChartTabs } from "@/components/revenue/StoreChartTabs";
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
} from "@/components/revenue/historyRows";
import { Card, CenterMessage, Muted, Screen } from "@/components/common/ui";
import type { StoreRevenue } from "@/api/types";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 店舗別の収益。
 *
 * Web も店舗ごとに同じ収益画面を持っている（MonoDataTotal.jsx の「収益レポートへ」→
 * /coinLaundry/{id}/coinDataList）。組織全体版が収益タブ app/(tabs)/revenue.tsx で、
 * こちらは同じ構成のまま storeId で絞っただけ。**部品は全部あちらと共用**する
 * （グラフ・表・履歴の行・並び替え）。集計ロジックを二重に持たない。
 *
 * 全体版と違うのは 2 点だけ。
 *   - 店舗が固定なので「店舗別の売上」タブが無い。代わりに店舗の中の傾向を出す
 *     「1回あたり」を足してある
 *   - 総額収益カード（TotalRevenueCard）は組織全体の話なので出さない
 */
export default function StoreFunds() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [sortField, setSortField] = useState<HistorySortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  /** null = 担当者で絞り込まない */
  const [collecter, setCollecter] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [limit, setLimit] = useState(() => initialLimit(true));

  const store = useStore(id);
  /**
   * ⚠️ **`useFundList` を使わないこと。** あちらは BFF 側で
   *    `startEpoch = changeEpocFromNowYearMonth(-2)` が固定されているため
   *    「直近 2 か月」しか返らず、`offset` をいくら進めても古い集金に**絶対に届かない**。
   *    この画面は全期間を見せるので `useFundHistory`（`from=0` かつ `to` 省略）を使う。
   *    以前はここが `useFundList` で、2 か月より前の履歴が存在しないように見えていた。
   *
   * ⚠️ 並び替えはサーバに任せる。期間で区切って手元で並べ替えると
   *    「売上が高い順」の先頭がその期間の最高額になり、全期間の最高額でなくなる。
   */
  const list = useFundHistory({
    storeId: id,
    order: sortField === "amount" ? "totalFunds" : "date",
    asc: sortDirection === "asc",
  });
  const monthly = useMonthlySummary(id, Boolean(id));
  const revenue = useStoreRevenue();

  const rows = list.data ?? [];
  const points = monthly.data ?? [];

  /**
   * 月別売上カードに渡す店舗。1 件だけ渡すと表示店舗の絞り込みが消え、
   * 期間だけのシートになる（MonthlyRevenueCard 側が stores.length > 1 で出し分けている）。
   *
   * ⚠️ /funds/summary/stores は集金実績のある店舗しか返さない。
   *    まだ 1 件も集金していない店舗は空になるので、名前だけ作って ¥0 で渡す。
   */
  const storeRevenue: StoreRevenue[] = useMemo(() => {
    const found = (revenue.data ?? []).find((s) => s.laundryId === id);
    if (found) return [found];
    if (!id) return [];
    return [{ laundryId: id, laundryName: store.data?.store ?? "", total: 0 }];
  }, [revenue.data, id, store.data?.store]);

  /**
   * この店舗の全期間の売上総額。
   *
   * ⚠️ **`rows` の総和で出さない。** 担当者で絞ると総額まで動いてしまう。
   *    /funds/summary/stores は全件を店舗ごとに畳んだものなので、これが正。
   * ⚠️ 月次サマリー（points）の総和でも出さない。あちらは前年同月比のため
   *    **過去 2 年に固定**されていて、それより前の集金が落ちる。
   */
  const storeTotal = storeRevenue[0]?.total ?? 0;

  /**
   * 月の見出しでまとめるか。
   * ⚠️ 売上順のときは畳まない。高い順に並んだものを月で区切っても区切りが意味を持たない。
   */
  const isGrouped = sortField === "date";

  /** 担当者の選択肢。実際に集金した人だけを出す（メンバー一覧ではなく実績から作る） */
  const collecterOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const item of rows) seen.add(collecterName(item));
    return [...seen];
  }, [rows]);

  /** ⚠️ 並べ替えないこと。サーバが全期間を ORDER BY で並べて返している */
  const filtered = useMemo(
    () => (collecter === null ? rows : rows.filter((item) => collecterName(item) === collecter)),
    [rows, collecter]
  );

  const listRows = useMemo(
    () => buildHistoryRows({ items: filtered, grouped: isGrouped, collapsed, limit }),
    [filtered, isGrouped, collapsed, limit]
  );

  if (list.isLoading && rows.length === 0 && monthly.isLoading) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {store.data ? `${store.data.store}店の収益` : "収益"}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <FlashList
        data={listRows}
        keyExtractor={(row) => row.key}
        // タブバーは画面の下に並ぶ（重ならない）ので、下端の余白に insets.bottom は足さない
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => {
              list.refetch();
              monthly.refetch();
              revenue.refetch();
            }}
            tintColor={color.teal}
          />
        }
        ListHeaderComponent={
          <View>
            {/* 全体版と同じカード。店舗が固定なので 2 列目を「店舗数」から「集金回数」に替える */}
            <TotalRevenueCard
              title={store.data ? `${store.data.store}店の売上総額` : "売上総額"}
              total={storeTotal}
              countLabel="集金回数"
              countValue={rows.length > 0 ? `${rows.length}回` : "—"}
              firstMonth={points[0]?.month}
              lastMonth={points[points.length - 1]?.month}
              /* 過去 2 年ぶんの総和が総額に届かない＝それより前にも集金がある */
              hasOlderThanWindow={
                points.length > 0 &&
                storeTotal > points.reduce((sum, point) => sum + point.total, 0)
              }
              latestFundDate={latestFundDate(rows)}
              isLoading={revenue.isLoading && !revenue.data}
            />

            <StoreChartTabs
              storeRevenue={storeRevenue}
              revenueLoading={revenue.isLoading && !revenue.data}
              points={points}
            />

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

            {/* 並び順を変えた直後。前の並びを出したまま裏で取り直している */}
            {list.isFetching && <Muted style={styles.loadingNote}>並び替えています…</Muted>}
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Muted>
              {collecter === null
                ? "この店舗の集金データがありません"
                : `${collecter}の集金データがありません`}
            </Muted>
          </Card>
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
                unit={row.unit}
                loading={list.isFetching}
                onPress={() => setLimit((n) => n + limitStep(isGrouped))}
              />
            );
          }
          if (row.kind === "end") {
            return <ListEndRow fundCount={row.fundCount} />;
          }
          /* 全体版と同じ。押すと集金データの詳細（編集・削除ができる画面）へ */
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: color.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: font.uiBold,
    fontSize: 16,
    color: color.textMain,
  },
  cardTitle: {
    fontFamily: font.uiBold,
    fontSize: 14,
    color: color.tealDeeper,
    marginBottom: spacing.xs,
  },
  cardNote: { fontSize: 11, marginBottom: spacing.md },
  sectionTitle: {
    fontFamily: font.uiBold,
    fontSize: 17,
    color: color.tealDeeper,
    marginBottom: spacing.md,
  },
  loadingNote: { fontSize: 11, marginBottom: spacing.md },
});
