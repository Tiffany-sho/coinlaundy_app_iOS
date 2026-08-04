import { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Appear } from "@/components/common/Appear";
import { ScreenTitleRow } from "@/components/common/SettingsButton";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useScrollToTop } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useBootstrap,
  paymentMethodNames,
  useFundHistory,
  useStores,
  useStoreRevenue,
} from "@/api/queries";
import { useOutbox } from "@/offline/OutboxProvider";
import { EXPORT_MIME_TYPE, saveAndShareBase64 } from "@/export/saveFile";
import { errorMessage } from "@/components/funds/fundCache";
import { ExportSheet } from "@/components/revenue/ExportSheet";
import { StoreRankBars } from "@/components/revenue/charts";
import { MonthlyRevenueCard } from "@/components/revenue/MonthlyRevenueCard";
import { MonthlyProfitCard } from "@/components/revenue/MonthlyProfitCard";
import { TotalRevenueCard } from "@/components/revenue/TotalRevenueCard";
import { NoStoresNotice } from "@/components/stores/NoStoresNotice";
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
  type HistoryRow,
} from "@/components/revenue/historyRows";
import { matchesMethods } from "@/components/revenue/methodFilter";
import { expensesEnabled } from "@/components/expenses/expensesEnabled";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { useToast } from "@/components/common/toast";
import { Card, CenterMessage, Muted, OfflineBanner, Screen } from "@/components/common/ui";
import { planAtLeast } from "@/billing/products";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";
import type { ExportFile } from "@/api/types";

/**
 * グラフカードの切り替えタブ。既定は「月別」（Web も月別売上カードが主役）。
 *
 * ⚠️ **「月次サマリー」は 2026-08-03 に「月別利益」へ差し替えた。**
 *    前月比・前年同月比の表より、売上 − 経費のほうが日々の判断に効くため。
 * ⚠️ **経費を使わない組織では「月別利益」を出さない。** 経費が常に 0 で
 *    利益＝売上になり、月別売上と同じ形の棒が 2 枚並ぶだけになる。
 */
type ChartTab = "store" | "monthly" | "profit";

const CHART_TABS: { value: ChartTab; label: string }[] = [
  { value: "store", label: "店舗別" },
  { value: "monthly", label: "月別" },
  { value: "profit", label: "月別利益" },
];

/** 右下に固定する書き出しボタンの直径。店舗一覧の「追加」と同じ */
const FAB_SIZE = 62;

/**
 * リストの下に空ける余白。
 * ⚠️ **ボタンの高さぶん確保すること。** 足りないと最終行（合計や「さらに表示」）が
 *    ボタンの下に潜り、一番読みたい行が指で隠れる。
 */
const FAB_CLEARANCE = FAB_SIZE + spacing.lg + spacing.md;

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
  /** 支払方法の絞り込み。⚠️ **空配列 = 絞らない**（複数選べる） */
  const [methods, setMethods] = useState<string[]>([]);
  /** 折りたたんだ月の見出し。Web の CoinManyDataTable も月ごとに畳める */
  const [collapsed, setCollapsed] = useState<string[]>([]);
  /**
   * 一度に出す量。日付順なら月数、売上順なら件数。「さらに表示」で増える。
   * ⚠️ これは**表示量**であって取得範囲ではない。並び替えは常に全データが対象。
   */
  const [limit, setLimit] = useState(() => initialLimit(true));
  const [exportOpen, setExportOpen] = useState(false);
  /**
   * 書き出せたファイル。⚠️ **シートが閉じきってから共有する**ために一旦ここに置く。
   *    Modal が出ている間に共有シートを開くと、iOS は「すでに別の画面を出している」
   *    として何も表示せずに失敗する（docs/traps.md の Modal 二重表示）。
   */
  const [pendingFile, setPendingFile] = useState<ExportFile | null>(null);

  /**
   * ⚠️ 全期間ぶんを、サーバに並べさせて受け取る。
   *    期間で区切って取ると「売上が高い順」の先頭がその期間の最高額になってしまう。
   */
  const list = useFundHistory({
    order: sortField === "amount" ? "totalFunds" : "date",
    asc: sortDirection === "asc",
  });
  const byStore = useStoreRevenue();
  /* ⚠️ 支払方法の名前を集めるためだけ。収益サマリ（byStore）は支払方法を持たない */
  const storeList = useStores();
  const bootstrap = useBootstrap();

  /**
   * 書き出せるプランか。
   * ⚠️ **これは表示の出し分けだけ。** 実際の可否は BFF が organizations.plan で
   *    判定して 403 を返す（アプリ側の判定を信じない）。
   */
  const plan = bootstrap.data?.plan?.plan;
  /* ⚠️ プラン名を並べない。足すたびに直し漏れる（products.ts の planAtLeast を参照） */
  const canExport = planAtLeast(plan ?? "free", "pro");

  /* ⚠️ 判定は必ず expensesEnabled() を通す（`?? true` などを画面に書かない） */
  const useExpenses = expensesEnabled(bootstrap.data?.organization);
  /* ⚠️ 経費を切っている間に「月別利益」を選んだままにしない。タブごと消えるので
        何も描かれないカードが残る。既定の「月別」へ戻す */
  const activeTab: ChartTab = tab === "profit" && !useExpenses ? "monthly" : tab;
  const visibleTabs = useExpenses ? CHART_TABS : CHART_TABS.filter((t) => t.value !== "profit");

  const rows = list.data ?? [];
  const stores = byStore.data ?? [];

  /**
   * 総額収益と、その集計期間。
   *
   * ⚠️ 月別売上カードの「集金総額」とは集計範囲が違う。月次サマリー
   *    （/funds/summary/monthly）は前年同月比のために過去 2 年分しか返さないので、
   *    その総和は「全期間」にならない。全期間の総額は店舗別集計
   *    （/funds/summary/stores＝全件を店舗ごとに畳んだもの）の総和で出す。
   *    ⚠️ 期間と回数も同じ理由で店舗別集計から取る。あちらの月次から作ると
   *       2 年より前の集金が範囲に入らない。
   */
  const allTimeTotal = stores.reduce((sum, store) => sum + store.total, 0);
  /**
   * ⚠️ **`?? 0` を外さないこと。** count / firstDate / lastDate は後から足した項目で、
   *    MMKV に残っている**前のバージョンのキャッシュには入っていない**（起動直後は
   *    そちらが即座に返る）。素で足すと NaN になり、そのまま画面に出る。
   */
  const fundCount = stores.reduce((sum, store) => sum + (store.count ?? 0), 0);
  const firstDate = minDate(stores.map((store) => store.firstDate));
  const lastDate = maxDate(stores.map((store) => store.lastDate));

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
      rows.filter(
        (item) =>
          (collecter === null || collecterName(item) === collecter) &&
          matchesMethods(item, methods)
      ),
    [rows, collecter, methods]
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
  /** タブをもう一度押したら先頭へ戻す（今いる画面がタブの 1 枚目のときだけ動く） */
  useScrollToTop(listRef);
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
    /*
      ⚠️ **支払方法も依存に入れる。** 絞り込むと行数が変わるので、
         「さらに表示」の残量が実態とずれたまま残る（3 か月ぶん出した状態で
         絞ると 1 か月しか無いのに「残り 2 か月」と出る）。
      ⚠️ methods は毎レンダー新しい配列になり得るので、中身を畳んだ文字列で比べる。
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortField, sortDirection, collecter, methods.join(","), isGrouped]);

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

  async function refreshAll() {
    const results = await Promise.all([list.refetch(), byStore.refetch()]);
    // 引っ張って更新したのに古い数字のままだと気づけないので、失敗だけ知らせる
    if (results.some((result) => result.isError)) {
      toast.error("最新のデータを取得できませんでした");
    }
  }

  if (list.isLoading && rows.length === 0 && byStore.isLoading) {
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
          // ⚠️ 右下の書き出しボタンに最終行が潜らないよう、ボタンの高さぶん空ける
          paddingBottom: FAB_CLEARANCE,
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
        /*
          ⚠️ **Appear を使ってよいのはこのヘッダの中の静的な塊だけ。**
             renderItem（明細行）に付けるとセルが使い回されるので、
             スクロールのたびに古い行が「現れ直す」ように見える。
          ⚠️ **onLayout で位置を測る View を Appear で包まないこと。** `layout.y` は
             親からの相対位置なので、包むと 0 になって着地点が壊れる（下の売上履歴を参照）。
        */
        ListHeaderComponent={
          <View>
            <Appear index={0}>
              <ScreenTitleRow title="収益" style={styles.titleRow} />
            </Appear>

            {pendingCount > 0 && (
              <Pressable onPress={() => router.push("/")} style={styles.badge}>
                <Text style={styles.badgeText}>未送信 {pendingCount} 件</Text>
              </Pressable>
            )}

            {/*
              店舗が 1 件も無いと下のカードが全部空になる。何をすれば埋まるのかを先に出す。
              ⚠️ **読み込み中は出さない**（`storeList.data` が来てから判定する）。
              ⚠️ 判定に収益サマリ（`stores`）を使わないこと。あちらは**集金のある店舗
                 だけ**なので、店舗を登録済みで集金がまだ 0 件のときも 0 件になり、
                 「まず店舗を登録しましょう」が消えなくなる。
            */}
            {storeList.data?.length === 0 && (
              <Appear index={1}>
                <NoStoresNotice
                  isAdmin={bootstrap.data?.organization?.myRole === "admin"}
                  style={{ marginBottom: spacing.lg }}
                />
              </Appear>
            )}

            <Appear index={2}>
              <TotalRevenueCard
                total={allTimeTotal}
                stats={[
                  { label: "店舗数", value: stores.length > 0 ? `${stores.length}店舗` : "—" },
                  { label: "集金回数", value: fundCount > 0 ? `${fundCount}回` : "—" },
                ]}
                firstDate={firstDate}
                lastDate={lastDate}
                isLoading={byStore.isLoading && !byStore.data}
              />
            </Appear>

            {/* ⚠️ タブとグラフはまとめて 1 つの Appear に入れる。分けると
                   タブを切り替えるたびにグラフだけが出直す */}
            <Appear index={3}>
              <SegmentedTabs options={visibleTabs} value={activeTab} onChange={setTab} />

              {activeTab === "store" && (
                <Card style={{ marginBottom: spacing.lg }}>
                  <Text style={styles.cardTitle}>店舗別の売上</Text>
                  <StoreRankBars data={stores} />
                </Card>
              )}

              {activeTab === "monthly" && (
                <MonthlyRevenueCard stores={stores} isLoading={byStore.isLoading && !byStore.data} />
              )}

              {activeTab === "profit" && (
                <MonthlyProfitCard stores={stores} isLoading={byStore.isLoading && !byStore.data} />
              )}
            </Appear>

            {/*
              並び替え後はここへ戻す。y を測るためにひとつの View にまとめてある。

              ⚠️ **計測する View は Appear の「外側」に置くこと。** `onLayout` の
                 `layout.y` は**親からの相対位置**なので、Appear で包むと親が
                 Appear になって **y がほぼ 0 になる。** そうなると並び替えのたびに
                 ヘッダの先頭付近（月別売上のあたり）へ飛んで、履歴の頭に着かない。
                 ⚠️ 一度これで壊した。`transform` がレイアウトを動かさないことと、
                    **包むと親が変わること**は別の話。
            */}
            <View onLayout={onHistoryLayout}>
              <Appear index={4}>
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
                  /* ⚠️ 支払方法は店舗ごと（009）。店舗一覧から名前を集めて畳む */
                  methodNames={paymentMethodNames(storeList.data)}
                  methods={methods}
                  onMethodsChange={setMethods}
                />
              </Appear>
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

      {/* 書き出しの入口。⚠️ **スクロールしても消えないよう固定にしてある。**
          見出しの横に置いていたときは、履歴を見ている間ずっと画面の外にあった。
          形は店舗一覧の「追加」と揃える（アプリの中で「常に押せる主操作」の語彙を 1 つにする）。
          ⚠️ プラン外でも押せるようにして、理由はシートの中で説明する
             （押せないボタンだけが置いてあると、なぜ駄目なのか分からない） */}
      <Pressable
        onPress={() => setExportOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="集金データを書き出す"
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="download-outline" size={24} color="#FFFFFF" />
        <Text style={styles.fabLabel}>書き出し</Text>
      </Pressable>

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        stores={stores}
        canExport={canExport}
        canExportExpenses={expensesEnabled(bootstrap.data?.organization)}
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

/**
 * 店舗ごとの最初 / 最後の集金日から、組織全体の範囲を出す。
 *
 * ⚠️ **`!== null` で弾かない。** 1 件も集金が無い店舗は null を返してくるが、
 *    それとは別に、MMKV に残っている**前のバージョンのキャッシュには
 *    この項目自体が無い**（undefined）。`undefined !== null` は true なので
 *    素通りし、Math.min が NaN を返して日付が「NaN/NaN/NaN」になる。
 *    数値であることまで確かめること。
 */
function knownDates(dates: (number | null)[]): number[] {
  return dates.filter(
    (date): date is number => typeof date === "number" && Number.isFinite(date)
  );
}

function minDate(dates: (number | null)[]): number | null {
  const known = knownDates(dates);
  return known.length > 0 ? Math.min(...known) : null;
}

function maxDate(dates: (number | null)[]): number | null {
  const known = knownDates(dates);
  return known.length > 0 ? Math.max(...known) : null;
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  /* 右下に固定する書き出しボタン。店舗一覧の「追加」と同じ寸法・同じ影。
     ⚠️ タブバーは重ならず下に並ぶので insets.bottom は足さない（contentContainerStyle と同じ理由） */
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
