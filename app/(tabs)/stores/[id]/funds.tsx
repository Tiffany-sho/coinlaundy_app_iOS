import { useMemo, useState } from "react";
import { Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Appear } from "@/components/common/Appear";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useBootstrap,
  useFundHistory,
  useStore,
  useStoreRevenue,
} from "@/api/queries";
import { EXPORT_MIME_TYPE, saveAndShareBase64 } from "@/export/saveFile";
import { planAtLeast } from "@/billing/products";
import { ExportSheet } from "@/components/revenue/ExportSheet";
import { expensesEnabled } from "@/components/expenses/expensesEnabled";
import { errorMessage } from "@/components/funds/fundCache";
import { useToast } from "@/components/common/toast";
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
  limitStep,
} from "@/components/revenue/historyRows";
import { Card, CenterMessage, Muted, Screen } from "@/components/common/ui";
import type { ExportFile, StoreRevenue } from "@/api/types";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";

/** 収益タブの書き出しボタンと同じ大きさ（アプリの中で語彙を 1 つにする） */
const FAB_SIZE = 60;
/**
 * リストの下に空ける余白。
 * ⚠️ **ボタンの高さぶん確保すること。** 足りないと最終行（「すべて表示しました」や
 *    「さらに表示」）がボタンの下に潜り、一番読みたい行が指で隠れる。
 */
const FAB_CLEARANCE = FAB_SIZE + spacing.lg + spacing.md;

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
 *     「機器別」を足してある
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
  const [exportOpen, setExportOpen] = useState(false);
  /**
   * 書き出せたファイル。⚠️ **シートが閉じきってから共有する**ために一旦ここに置く。
   *    Modal が出ている間に共有シートを開くと、iOS は「すでに別の画面を出している」
   *    として何も表示せずに失敗する（docs/traps.md の Modal 二重表示）。
   */
  const [pendingFile, setPendingFile] = useState<ExportFile | null>(null);
  const toast = useToast();

  const store = useStore(id);
  const bootstrap = useBootstrap();
  /**
   * 書き出せるプランか。
   * ⚠️ **これは表示の出し分けだけ。** 実際の可否は BFF が organizations.plan で
   *    判定して 403 を返す（アプリ側の判定を信じない）。
   */
  const plan = bootstrap.data?.plan?.plan;
  /* ⚠️ プラン名を並べない。足すたびに直し漏れる（products.ts の planAtLeast を参照） */
  const canExport = planAtLeast(plan ?? "free", "pro");
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
  const revenue = useStoreRevenue();

  const rows = list.data ?? [];

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
    return [
      {
        laundryId: id,
        laundryName: store.data?.store ?? "",
        total: 0,
        count: 0,
        firstDate: null,
        lastDate: null,
      },
    ];
  }, [revenue.data, id, store.data?.store]);

  /**
   * この店舗の全期間の売上総額・回数・期間。
   *
   * ⚠️ **`rows` から出さない。** 担当者で絞ると総額まで動いてしまう。
   *    /funds/summary/stores は全件を店舗ごとに畳んだものなので、これが正。
   * ⚠️ `/funds/summary/monthly` からも出さない。あちらは前年同月比のため
   *    **過去 2 年に固定**されていて、それより前の集金が落ちる。
   */
  const summary = storeRevenue[0];

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

  /**
   * 書き出したファイルを端末に置いて共有シートへ渡す。
   * ⚠️ **必ずシートを閉じたあとに呼ぶこと**（pendingFile のコメントを参照）。
   */
  async function shareFile(file: ExportFile) {
    try {
      const result = await saveAndShareBase64(
        file.name,
        file.base64,
        EXPORT_MIME_TYPE[file.format]
      );
      // 共有をやめただけなら失敗ではないので、何も出さない
      if (result === "shared") {
        toast.success(`${file.recordCount}件の集金データを書き出しました`);
      }
    } catch (e) {
      toast.error(errorMessage(e, "ファイルを保存できませんでした"));
    }
  }

  if (list.isLoading && rows.length === 0 && revenue.isLoading) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* ⚠️ ヘッダは動かさない。戻るボタンが遅れて現れると押しそこねる */}
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
        // ⚠️ 右下の書き出しボタンに最終行が潜らないよう、ボタンの高さぶん空ける
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: FAB_CLEARANCE }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => {
              list.refetch();
              revenue.refetch();
            }}
            tintColor={color.teal}
          />
        }
        /*
          ⚠️ **Appear を使ってよいのはこのヘッダの中の静的な塊だけ。**
             renderItem（明細行）に付けるとセルが使い回されるので、
             スクロールのたびに古い行が「現れ直す」ように見える。
          ⚠️ この画面には onLayout で位置を測っている View が無いので素直に包める。
             全体版（revenue.tsx）は売上履歴の見出しの y を測っているので、
             そちらは測る View を外側にしてある。
        */
        ListHeaderComponent={
          <View>
            {/*
              全体版と同じカード・同じ見出し。店舗が固定なので下段は「集金回数」だけ。
              ⚠️ 見出しに店舗名を混ぜない。どの店舗かは上のヘッダ（「◯◯店の収益」）で分かる
            */}
            <Appear index={0}>
              <TotalRevenueCard
                total={summary?.total ?? 0}
                stats={[
                  {
                    label: "集金回数",
                    value: (summary?.count ?? 0) > 0 ? `${summary.count}回` : "—",
                  },
                ]}
                firstDate={summary?.firstDate ?? null}
                lastDate={summary?.lastDate ?? null}
                isLoading={revenue.isLoading && !revenue.data}
              />
            </Appear>

            <Appear index={1}>
              <StoreChartTabs
                storeRevenue={storeRevenue}
                revenueLoading={revenue.isLoading && !revenue.data}
                storeId={id}
              />
            </Appear>

            <Appear index={2}>
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
            </Appear>

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

      {/* 書き出しの入口。収益タブと同じ形・同じ位置に置く（操作の語彙を 1 つにする）。
          ⚠️ プラン外でも押せるようにして、理由はシートの中で説明する */}
      <Pressable
        onPress={() => setExportOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${store.data?.store ?? ""}店の集金データを書き出す`}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="download-outline" size={24} color="#FFFFFF" />
        <Text style={styles.fabLabel}>書き出し</Text>
      </Pressable>

      {/* ⚠️ **`lockedStoreId` を必ず渡す。** 渡さないと選択が空＝全店舗の規約に落ちて、
             「この店舗の収益」から組織の全店舗ぶんが書き出される */}
      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        stores={storeRevenue}
        canExport={canExport}
        canExportExpenses={expensesEnabled(bootstrap.data?.organization)}
        lockedStoreId={id}
        onDone={(file) => {
          setExportOpen(false);
          /* ⚠️ onDismiss は iOS 専用。それ以外では発火しないので、
                待たずにそのまま処理する（web のブラウザ確認がここで止まらないように） */
          if (Platform.OS === "ios") setPendingFile(file);
          else void shareFile(file);
        }}
        onDismiss={() => {
          if (!pendingFile) return;
          const file = pendingFile;
          setPendingFile(null);
          void shareFile(file);
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
  /* 収益タブ（app/(tabs)/revenue/index.tsx）の fab と同じ値。片方だけ変えないこと */
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radius.pill,
    backgroundColor: color.teal,
    borderWidth: 2,
    borderColor: color.tealDark,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.hero,
  },
  fabLabel: { fontFamily: font.uiBold, fontSize: 9, color: "#FFFFFF", letterSpacing: 0.3 },
});
