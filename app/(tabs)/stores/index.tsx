import { useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useScrollToTop } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap, useLaundryStates, useStores } from "@/api/queries";
import { ApiError } from "@/api/client";
import { Input } from "@/components/common/form";
import {
  SortControls,
  type SortAxis,
  type SortDirection,
} from "@/components/common/SortControls";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { needsAttention } from "@/components/manage/laundryState";
import { CenterMessage, Card, Muted, OfflineBanner, Screen, Title } from "@/components/common/ui";
import { color, font, radius, shadow, spacing, HIT_SIZE } from "@/theme/tokens";
import type { LaundryState, Store } from "@/api/types";

/** Web と同じ「画像なし」のプレースホルダ */
const NO_IMAGE =
  "https://hhdipgftsrsmmuqyifgt.supabase.co/storage/v1/object/public/Laundry-Images/public/no-image.png";

/**
 * 絞り込みの軸。
 *   すべて   … Web の一覧と同じ（Web には状態での絞り込みがない）
 *   要対応   … 在庫不足か故障機のある店舗だけ。巡回先を決めるための軸で、
 *              判定は Web の getStockStates / getMachinesStates と同じ条件を使う
 *              （src/components/manage/laundryState.ts）
 */
type StoreFilter = "all" | "alert";

/**
 * 並び替えの軸。Web の一覧は DB の返り順のままで並び替えを持たないので、ここで決めている。
 *
 * ⚠️ かつてあった「要対応が先」は廃止した。上の「すべて / 要対応」タブと役割が重複していて、
 *    しかも 3 択だとダイアログを開かないと今どの軸で並んでいるか分からなかった。
 *    要対応だけ見たいならタブで絞る。
 */
type StoreSort = "name" | "created";

const FILTERS = [
  { value: "all", label: "すべて" },
  { value: "alert", label: "要対応" },
] as const satisfies readonly { value: StoreFilter; label: string }[];

/**
 * 店舗の登録日時（epoch ミリ秒）。取れなければ null。
 *
 * ⚠️ `Date.parse(...)` の結果をそのまま比較に使わないこと。壊れた文字列だと NaN が返り、
 *    比較関数が NaN を返す＝**並び順が変わらない**（エラーも出ない）。
 *    Postgres の timestamptz は小数第 6 位まで返ってくるので、実際に取りこぼしうる。
 *
 * ⚠️ そもそも created_at は laundry_store の DB 既定値まかせで、Web の createStore は
 *    書いていない。列が後から足された環境では既存行が NULL のままになる。
 */
function createdAtOf(store: Store): number | null {
  if (!store.created_at) return null;
  const ms = Date.parse(store.created_at);
  return Number.isFinite(ms) ? ms : null;
}

const SORT_AXES = [
  {
    value: "name",
    label: "店舗名",
    // 「昇順」では中身が伝わらないので、実際の並びで書く
    hint: { asc: "あ→わ", desc: "わ→あ" },
    defaultDirection: "asc",
  },
  {
    value: "created",
    label: "登録日",
    hint: { desc: "新しい順", asc: "古い順" },
    defaultDirection: "desc",
  },
] as const satisfies readonly SortAxis<StoreSort>[];

export default function Stores() {
  const insets = useSafeAreaInsets();
  /** タブをもう一度押したら先頭へ戻す（今いる画面がタブの 1 枚目のときだけ動く） */
  const listRef = useRef<FlashListRef<Store>>(null);
  useScrollToTop(listRef);
  const router = useRouter();
  const { data, isLoading, isRefetching, refetch, error } = useStores();
  // 在庫・設備の状況。「要対応」の絞り込みに使う
  const states = useLaundryStates();
  const bootstrap = useBootstrap();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StoreFilter>("all");
  const [sort, setSort] = useState<StoreSort>("name");
  const [direction, setDirection] = useState<SortDirection>("asc");

  const isOffline = error instanceof ApiError && error.code === "OFFLINE";
  // 店舗の作成は admin だけ（Web の createStore も myRole !== "admin" を弾く）
  const canAddStore = bootstrap.data?.organization?.myRole === "admin";

  /** laundryId は laundry_store.id と同じ値。店舗 ID から状態を引けるようにしておく */
  const stateById = useMemo(() => {
    const map = new Map<string, LaundryState>();
    for (const state of states.data ?? []) map.set(state.laundryId, state);
    return map;
  }, [states.data]);

  const alertIds = useMemo(() => {
    const ids = new Set<string>();
    for (const state of states.data ?? []) {
      if (needsAttention(state)) ids.add(state.laundryId);
    }
    return ids;
  }, [states.data]);

  const visibleStores = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    // 検索の当たり判定は Web の SearchBox と同じ：店舗名か住所の部分一致（大文字小文字は無視）
    const filtered = (data ?? []).filter((store) => {
      if (filter === "alert" && !alertIds.has(store.id)) return false;
      if (!keyword) return true;
      return (
        store.store.toLowerCase().includes(keyword) ||
        (store.location ?? "").toLowerCase().includes(keyword)
      );
    });

    /** 日本語の店名を辞書順で並べる。同点時のよりどころにも使う */
    const byName = (a: Store, b: Store) => a.store.localeCompare(b.store, "ja");

    return [...filtered].sort((a, b) => {
      if (sort === "created") {
        /**
         * ⚠️ 欠けている店舗は**向きに関係なく末尾**へ回すこと。
         *    -Infinity を入れて差で比べると、古い順にしたとたん先頭に固まる。
         */
        const at = createdAtOf(a);
        const bt = createdAtOf(b);
        if (at === null || bt === null) {
          if (at !== bt) return at === null ? 1 : -1;
        } else if (at !== bt) {
          // ⚠️ 日付は desc が「新しい順」。店舗名の asc/desc とは向きの意味が逆なので
          //    共通の係数で反転させないこと（一度これで古い順と新しい順が入れ替わった）
          return direction === "desc" ? bt - at : at - bt;
        }
        return byName(a, b);
      }
      return direction === "asc" ? byName(a, b) : byName(b, a);
    });
  }, [data, query, filter, sort, direction, alertIds]);

  /**
   * 登録日で並べられるか。1 店舗でも日付が取れれば並べる意味がある。
   * ⚠️ 取れないときに黙って店舗名順になると「押しても効かない」としか見えないので、
   *    理由を出す（実際にこれで「並び替えが適用されない」と報告を受けた）。
   */
  const canSortByCreated = useMemo(
    () => (data ?? []).some((store) => createdAtOf(store) !== null),
    [data]
  );

  /** 件数の出し方は Web の countText と同じ */
  const countText = useMemo(() => {
    const total = data?.length ?? 0;
    if (total === 0) return "店舗を追加してください";
    if (query.trim() || filter === "alert") return `${visibleStores.length}件 / 全${total}店舗`;
    return `全${total}店舗`;
  }, [data?.length, visibleStores.length, query, filter]);

  if (isLoading && !data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <CenterMessage
          text={error instanceof ApiError ? error.message : "店舗を取得できませんでした"}
        />
      </Screen>
    );
  }

  const hasStores = (data?.length ?? 0) > 0;

  return (
    <Screen>
      {isOffline && <OfflineBanner />}

      {/* 検索欄はリストの外に置く。FlashList の ListHeaderComponent に入れると
          再描画のたびに作り直されて入力途中でフォーカスが外れる */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Title style={{ fontSize: 22 }}>店舗一覧</Title>

        {hasStores && (
          <>
            <View style={styles.searchRow}>
              <Ionicons
                name="search"
                size={16}
                color={color.textFaint}
                style={styles.searchIcon}
              />
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="店舗名または住所で検索..."
                autoCorrect={false}
                returnKeyType="search"
                style={styles.searchInput}
              />
              {query.length > 0 && (
                <Pressable
                  onPress={() => setQuery("")}
                  accessibilityLabel="検索条件を消す"
                  style={styles.searchClear}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color={color.textFaint} />
                </Pressable>
              )}
            </View>

            <SegmentedTabs
              options={FILTERS}
              value={filter}
              onChange={setFilter}
              style={{ marginBottom: spacing.sm }}
            />

            <View style={styles.metaRow}>
              <Muted style={{ flex: 1, fontSize: 13 }}>{countText}</Muted>
              {/* 軸ごとにボタンを置く。効いている方を押すと逆順になる */}
              <SortControls
                axes={SORT_AXES}
                field={sort}
                direction={direction}
                onChange={(nextField, nextDirection) => {
                  setSort(nextField);
                  setDirection(nextDirection);
                }}
              />
            </View>

            {/* 押しても並びが変わらない理由を出す。黙って店舗名順に落ちると故障に見える */}
            {sort === "created" && !canSortByCreated && (
              <View style={styles.sortNote}>
                <Ionicons name="information-circle-outline" size={14} color={color.orange500} />
                <Text style={styles.sortNoteLabel}>
                  登録日が記録されていないため、店舗名順で表示しています
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      <FlashList
        ref={listRef}
        data={visibleStores}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        ListEmptyComponent={
          <Card>
            {!hasStores ? (
              <>
                <Muted>登録された店舗がありません</Muted>
                {canAddStore && (
                  <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>
                    右下のボタンから新しい店舗を追加できます
                  </Muted>
                )}
              </>
            ) : query.trim() ? (
              <>
                <Muted>「{query.trim()}」に一致する店舗がありません</Muted>
                <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>
                  別のキーワードで検索してみてください
                </Muted>
              </>
            ) : (
              <Muted>要対応の店舗はありません</Muted>
            )}
          </Card>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
              states.refetch();
            }}
            tintColor={color.teal}
          />
        }
        renderItem={({ item }) => (
          <StoreCard
            store={item}
            state={stateById.get(item.id)}
            onPress={() => router.push({ pathname: "/stores/[id]", params: { id: item.id } })}
            onCollect={() =>
              router.push({ pathname: "/collect/[storeId]", params: { storeId: item.id } })
            }
          />
        )}
      />

      {/* 店舗の追加。Web の AddBtn と同じ右下固定の丸ボタン。admin だけに出す。
          ⚠️ Web の AddBtn は上限到達時にプラン画面へ誘導するが、そちらは移植しない
             （App Store Guideline 3.1.3(a)：課金への導線・言及を置かない） */}
      {canAddStore && (
        <Pressable
          onPress={() => router.push("/stores/new")}
          accessibilityLabel="店舗を追加"
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={26} color="#FFFFFF" />
          <Text style={styles.fabLabel}>追加</Text>
        </Pressable>
      )}
    </Screen>
  );
}

/**
 * Web の CoinLaundryList.jsx と同じ組み方。
 *   16:9 の画像 → 店名（末尾に「店」）→ 住所（ピンアイコン付き）→ 操作ボタン
 * 状態が取れている店舗には「要対応」バッジを重ねる。巡回前に一覧で気付けるようにするため。
 */
function StoreCard({
  store,
  state,
  onPress,
  onCollect,
}: {
  store: Store;
  state: LaundryState | undefined;
  onPress: () => void;
  onCollect: () => void;
}) {
  const uri = store.images?.[0]?.url ?? NO_IMAGE;
  const isAlert = state ? needsAttention(state) : false;

  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.9 }}>
        <View style={styles.imageWrap}>
          <Image source={{ uri }} style={styles.image} contentFit="cover" transition={150} />
          {isAlert && (
            <View style={styles.alertBadge}>
              <Ionicons name="alert-circle" size={13} color="#FFFFFF" />
              <Text style={styles.alertBadgeLabel}>要対応</Text>
            </View>
          )}
        </View>

        <View style={styles.bodyArea}>
          <Text style={styles.name} numberOfLines={1}>
            {store.store}店
          </Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={15} color={color.textMuted} />
            <Text style={styles.location} numberOfLines={1}>
              {store.location ?? "住所未登録"}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.footerArea}>
        <Pressable onPress={onPress} style={({ pressed }) => [styles.ghostButton, pressed && { opacity: 0.8 }]}>
          <Text style={styles.ghostLabel}>詳細</Text>
        </Pressable>
        <Pressable onPress={onCollect} style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}>
          <Ionicons name="cash-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryLabel}>集金</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  searchRow: { justifyContent: "center" },
  searchIcon: { position: "absolute", left: spacing.md, zIndex: 1 },
  searchInput: { paddingLeft: 38, paddingRight: 42 },
  searchClear: { position: "absolute", right: spacing.md },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sortNote: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sortNoteLabel: { flex: 1, fontFamily: font.ui, fontSize: 11, color: color.orange500 },

  card: {
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.divider,
    overflow: "hidden",
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  // Web は paddingBottom 56.25% で 16:9 を作っている
  imageWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: color.tealPale },
  image: { width: "100%", height: "100%" },
  alertBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: color.orange500,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  alertBadgeLabel: { fontFamily: font.uiBold, fontSize: 11, color: "#FFFFFF" },
  bodyArea: { padding: spacing.lg, gap: spacing.sm },
  name: { fontFamily: font.uiBold, fontSize: 19, color: color.textMain, letterSpacing: -0.3 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  location: { fontFamily: font.ui, fontSize: 14, color: color.textMuted, flex: 1 },
  footerArea: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, paddingTop: 0 },
  ghostButton: {
    flex: 1,
    minHeight: HIT_SIZE,
    borderRadius: radius.card - 6,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMuted },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: HIT_SIZE,
    borderRadius: radius.card - 6,
    backgroundColor: color.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: { fontFamily: font.uiBold, fontSize: 14, color: "#FFFFFF" },

  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    backgroundColor: color.teal,
    borderWidth: 2,
    borderColor: color.tealDark,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.hero,
  },
  fabLabel: { fontFamily: font.uiBold, fontSize: 10, color: "#FFFFFF", letterSpacing: 0.5 },
});
