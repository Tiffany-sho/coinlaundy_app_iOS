import { useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap, useLaundryStates, useStores } from "@/api/queries";
import { ApiError } from "@/api/client";
import { Input } from "@/components/form";
import { useDialog } from "@/components/dialog";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { needsAttention } from "@/components/laundryState";
import { CenterMessage, Card, Muted, OfflineBanner, Screen, Title } from "@/components/ui";
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
 *              （src/components/laundryState.ts）
 */
type StoreFilter = "all" | "alert";

/** 並び替えの軸。Web の一覧は DB の返り順のままで並び替えを持たないので、ここで決めている */
type StoreSort = "name" | "alert" | "newest";

const FILTERS = [
  { value: "all", label: "すべて" },
  { value: "alert", label: "要対応" },
] as const satisfies readonly { value: StoreFilter; label: string }[];

const SORT_LABEL: Record<StoreSort, string> = {
  name: "店舗名順",
  alert: "要対応が先",
  newest: "登録が新しい順",
};

export default function Stores() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const { data, isLoading, isRefetching, refetch, error } = useStores();
  // 在庫・設備の状況。「要対応」の絞り込みと並び替えに使う
  const states = useLaundryStates();
  const bootstrap = useBootstrap();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StoreFilter>("all");
  const [sort, setSort] = useState<StoreSort>("name");

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

    return [...filtered].sort((a, b) => {
      if (sort === "alert") {
        const diff = Number(alertIds.has(b.id)) - Number(alertIds.has(a.id));
        if (diff !== 0) return diff;
      }
      if (sort === "newest") {
        // created_at は省略されうる。欠けているものは末尾へ回す
        const at = a.created_at ? Date.parse(a.created_at) : Number.NEGATIVE_INFINITY;
        const bt = b.created_at ? Date.parse(b.created_at) : Number.NEGATIVE_INFINITY;
        if (at !== bt) return bt - at;
      }
      // 既定と同点時のよりどころ。日本語の店名を辞書順で並べる
      return a.store.localeCompare(b.store, "ja");
    });
  }, [data, query, filter, sort, alertIds]);

  /** 件数の出し方は Web の countText と同じ */
  const countText = useMemo(() => {
    const total = data?.length ?? 0;
    if (total === 0) return "店舗を追加してください";
    if (query.trim() || filter === "alert") return `${visibleStores.length}件 / 全${total}店舗`;
    return `全${total}店舗`;
  }, [data?.length, visibleStores.length, query, filter]);

  async function chooseSort() {
    const picked = await dialog.choose<StoreSort>({
      title: "並び替え",
      options: (Object.keys(SORT_LABEL) as StoreSort[]).map((value) => ({
        value,
        label: SORT_LABEL[value],
        selected: value === sort,
      })),
    });
    if (picked) setSort(picked);
  }

  /** 既定（店舗名順）から外れているか。外れているときだけボタンを塗る */
  const isSortActive = sort !== "name";

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
              <Pressable
                onPress={chooseSort}
                accessibilityLabel="並び替えを変える"
                style={({ pressed }) => [
                  styles.sortButton,
                  isSortActive && styles.sortButtonActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons
                  name="swap-vertical"
                  size={15}
                  color={isSortActive ? "#FFFFFF" : color.teal}
                />
                <Text style={[styles.sortLabel, isSortActive && styles.sortLabelActive]}>
                  {SORT_LABEL[sort]}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <FlashList
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
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: HIT_SIZE,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  /* 既定以外の軸で並べているときは塗って、効いていることを一目で分かるようにする */
  sortButtonActive: { backgroundColor: color.teal },
  sortLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
  sortLabelActive: { color: "#FFFFFF" },

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
