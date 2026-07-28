import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFundList, useMonthlySummary, useStore } from "@/api/queries";
import { MonthlyBarChart } from "@/components/revenue/charts";
import { MonthlySummaryTable } from "@/components/revenue/MonthlySummaryTable";
import { Card, CenterMessage, MoneyText, Muted, Screen } from "@/components/common/ui";
import { formatJstDate } from "@/shared/date";
import { color, font, spacing } from "@/theme/tokens";
import type { FundListItem } from "@/api/types";

/**
 * 店舗別の集金履歴。
 *
 * Web も店舗ごとに同じ収益画面を持っている（MonoDataTotal.jsx の「収益レポートへ」→
 * /coinLaundry/{id}/coinDataList）。組織全体版が収益タブ app/(tabs)/revenue.tsx で、
 * こちらは同じ構成のまま storeId で絞っただけ。
 *
 * useFundList / useMonthlySummary はどちらも storeId 付きの問い合わせに対応済みなので、
 * 集計ロジックを二重に持たない（グラフも表も組織全体版と同じ部品を使う）。
 */
export default function StoreFunds() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const store = useStore(id);
  const list = useFundList(id);
  const monthly = useMonthlySummary(id, Boolean(id));

  const rows = list.data?.pages.flat() ?? [];
  const points = monthly.data ?? [];
  const total = points.reduce((sum, m) => sum + m.total, 0);

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
          {store.data ? `${store.data.store}店の集金履歴` : "集金履歴"}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <FlashList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        // タブバーは画面の下に並ぶ（重ならない）ので、下端の余白に insets.bottom は足さない
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => {
              list.refetch();
              monthly.refetch();
            }}
            tintColor={color.teal}
          />
        }
        ListHeaderComponent={
          <View>
            <Card style={{ marginBottom: spacing.lg }}>
              <Text style={styles.cardTitle}>月別売上</Text>
              {/* ラベルと金額は隣り合わせにする。離すとどの数字の説明か分からなくなる */}
              <Muted>集金総額</Muted>
              <View style={{ marginTop: 2, marginBottom: spacing.lg }}>
                <MoneyText value={total} size={26} tone="deeper" />
              </View>
              <MonthlyBarChart data={points} />
            </Card>

            <MonthlySummaryTable data={points} />

            <Text style={styles.sectionTitle}>売上履歴</Text>
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Muted>この店舗の集金データがありません</Muted>
          </Card>
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator color={color.teal} style={{ marginVertical: spacing.lg }} />
          ) : null
        }
        renderItem={({ item }) => <FundRow item={item} />}
      />
    </Screen>
  );
}

/** 店舗が固定なので、組織全体版と違って店舗名は出さず日付と担当者を主にする */
function FundRow({ item }: { item: FundListItem }) {
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>{formatJstDate(item.date)}</Text>
          <Text style={styles.metaFaint}>{item.profiles?.username ?? "退会済みユーザー"}</Text>
        </View>
        <MoneyText value={item.totalFunds} size={16} tone="deeper" />
      </View>
    </Card>
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
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: font.uiBold,
    fontSize: 17,
    color: color.tealDeeper,
    marginBottom: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center" },
  date: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  metaFaint: { fontFamily: font.ui, fontSize: 12, color: color.textFaint, marginTop: 2 },
});
