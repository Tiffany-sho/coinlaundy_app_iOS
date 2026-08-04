import { useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Appear } from "@/components/common/Appear";
import { ScreenTitleRow } from "@/components/common/SettingsButton";
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
import { RegionFilter } from "@/components/stores/RegionFilter";
import { NoStoresNotice } from "@/components/stores/NoStoresNotice";
import { PLAN_STORE_LIMIT } from "@/billing/products";
import {
  CollectScopeSheet,
  useCollectLauncher,
} from "@/components/collect/CollectScopeSheet";
import {
  buildRegionOptions,
  prefectureOf,
  UNKNOWN_REGION,
} from "@/components/stores/prefecture";
import { needsAttention } from "@/components/manage/laundryState";
import { CenterMessage, Card, Muted, OfflineBanner, Screen } from "@/components/common/ui";
import { color, font, radius, shadow, spacing, HIT_SIZE } from "@/theme/tokens";
import type { LaundryState, Store } from "@/api/types";

/** Web と同じ「画像なし」のプレースホルダ */
const NO_IMAGE =
  "https://hhdipgftsrsmmuqyifgt.supabase.co/storage/v1/object/public/Laundry-Images/public/no-image.png";

/**
 * 並び替えの軸。Web の一覧は DB の返り順のままで並び替えを持たないので、ここで決めている。
 *
 * ⚠️ **「店舗名順」は廃止した**（2026-07-31）。店名にフリガナが無く、漢字を
 *    `localeCompare` で並べてもコードポイント順にしかならないので、利用者からは
 *    「押しても意味のない順番になる」としか見えなかった。地域で絞るほうが実務に合う
 *    （`RegionFilter`）。⚠️ 内部の同点処理では今も店名を使っている（並びを安定させるため）。
 *
 * ⚠️ かつてあった「要対応が先」も廃止済み。
 */
type StoreSort = "created";

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

/**
 * ⚠️ 軸が 1 つなので、実質「新しい順 ↔ 古い順」のトグルとして働く
 *    （`SortControls` は軸が 1 つなら常に効いている状態で描く）。
 */
const SORT_AXES = [
  {
    value: "created",
    label: "登録日",
    // 「降順」では中身が伝わらないので、実際の並びで書く
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
  /* ⚠️ 集金への遷移はこれを通す。支払方法がある店舗では何を集金するか聞く */
  const collect = useCollectLauncher();
  const { data, isLoading, isRefetching, refetch, error } = useStores();
  // 在庫・設備の状況。「要対応」の絞り込みに使う
  const states = useLaundryStates();
  const bootstrap = useBootstrap();

  const [query, setQuery] = useState("");
  /** 都道府県での絞り込み。null = すべての地域 */
  const [region, setRegion] = useState<string | null>(null);
  /** ⚠️ 軸は登録日だけなので、持つのは向きだけでよい */
  const [direction, setDirection] = useState<SortDirection>("desc");

  const isOffline = error instanceof ApiError && error.code === "OFFLINE";
  // 店舗の作成は admin だけ（Web の createStore も myRole !== "admin" を弾く）
  const canAddStore = bootstrap.data?.organization?.myRole === "admin";

  /**
   * 店舗数が上限に達しているか。**「追加」の行き先をプラン画面に切り替える**のに使う。
   *
   * ⚠️ **表示の出し分けだけ。** 実際に弾くのは Server Action（`PLAN_LIMITS`）。
   *    ここを緩めてもサーバが 1 件も余分に作らせない。
   * ⚠️ **`data.length` を使ってよいのは admin のときだけ。** `getStores()` は
   *    担当店舗（011）で絞るので、非管理者では組織の実際の店舗数より少なくなる。
   *    このボタン自体が admin 限定（`canAddStore`）なので成立している。
   *    **判定を非管理者にも使い回さないこと。**
   * ⚠️ **`null` は無制限**（Max）。`?? 0` のような既定値に倒すと、
   *    Max の組織が「上限」と表示されて店舗を追加できなくなる。
   * ⚠️ **プランが分からないうちは「上限なし」に倒す**（開くほうへ）。
   *    `?? "free"` で埋めないこと。bootstrap の読み込み中や綴り違いのときに
   *    **Max の組織が一瞬「上限」と表示され、押すとプラン画面へ飛ぶ。**
   *    サーバが必ず弾くので開くほうに倒しても実害が無く、逆に倒すと
   *    登録できるはずの人が止まる。
   */
  const planKey = bootstrap.data?.plan?.plan;
  const storeLimit = planKey ? PLAN_STORE_LIMIT[planKey] : null;
  const atStoreLimit =
    typeof storeLimit === "number" && (data?.length ?? 0) >= storeLimit;

  /** laundryId は laundry_store.id と同じ値。店舗 ID から状態を引けるようにしておく */
  const stateById = useMemo(() => {
    const map = new Map<string, LaundryState>();
    for (const state of states.data ?? []) map.set(state.laundryId, state);
    return map;
  }, [states.data]);

  /** 地域タブの選択肢。店舗数の多い順に並ぶ（先頭 3 つがタブに出る） */
  const regionOptions = useMemo(() => buildRegionOptions(data ?? []), [data]);

  const visibleStores = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    // 検索の当たり判定は Web の SearchBox と同じ：店舗名か住所の部分一致（大文字小文字は無視）
    const filtered = (data ?? []).filter((store) => {
      // 住所から判定できなかった店舗は UNKNOWN_REGION（＝「その他」）に入る
      if (region !== null && (prefectureOf(store.location) ?? UNKNOWN_REGION) !== region) {
        return false;
      }
      if (!keyword) return true;
      return (
        store.store.toLowerCase().includes(keyword) ||
        (store.location ?? "").toLowerCase().includes(keyword)
      );
    });

    /**
     * 同点のときのよりどころ。
     * ⚠️ **これは並びを安定させるためだけのもので、利用者向けの「店舗名順」ではない**
     *    （漢字は読み順にならないので、軸としては廃止した）。
     */
    const byName = (a: Store, b: Store) => a.store.localeCompare(b.store, "ja");

    return [...filtered].sort((a, b) => {
      /**
       * ⚠️ 登録日が欠けている店舗は**向きに関係なく末尾**へ回すこと。
       *    -Infinity を入れて差で比べると、古い順にしたとたん先頭に固まる。
       */
      const at = createdAtOf(a);
      const bt = createdAtOf(b);
      if (at === null || bt === null) {
        if (at !== bt) return at === null ? 1 : -1;
      } else if (at !== bt) {
        // ⚠️ 日付は desc が「新しい順」。向きの意味が数値の大小と逆になる
        return direction === "desc" ? bt - at : at - bt;
      }
      return byName(a, b);
    });
  }, [data, query, region, direction]);

  /**
   * 登録日で並べられるか。1 店舗でも日付が取れれば並べる意味がある。
   * ⚠️ 取れないときに黙って店舗名順になると「押しても効かない」としか見えないので、
   *    理由を出す（実際にこれで「並び替えが適用されない」と報告を受けた）。
   */
  const canSortByCreated = useMemo(
    () => (data ?? []).some((store) => createdAtOf(store) !== null),
    [data]
  );

  /** 選択中の地域の表示名。「その他」も含めてここから取る */
  const regionLabel = useMemo(
    () => regionOptions.find((option) => option.value === region)?.label ?? null,
    [regionOptions, region]
  );

  /** 件数の出し方は Web の countText と同じ */
  const countText = useMemo(() => {
    const total = data?.length ?? 0;
    if (total === 0) return "店舗を追加してください";
    if (query.trim() || region !== null) {
      return `${visibleStores.length}件 / 全${total}店舗`;
    }
    return `全${total}店舗`;
  }, [data?.length, visibleStores.length, query, region]);

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
      {/*
        ⚠️ **登場アニメーションを付けてよいのはこの検索・絞り込みの塊だけ。**
           一覧の行は FlashList のセルで使い回されるので、Appear を付けると
           スクロールのたびに古い行が「現れ直す」ように見える（Appear のコメント参照）。
      */}
      <Appear index={0} style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <ScreenTitleRow title="店舗一覧" />

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

            {/* 地域（都道府県）での絞り込み。
                ⚠️ 1 地域しか無いときは出さない。押しても結果が変わらないうえ、
                   全店舗が同じ県にある組織のほうが多いので常設すると邪魔になる */}
            {regionOptions.length > 1 && (
              <RegionFilter options={regionOptions} value={region} onChange={setRegion} />
            )}

            <View style={styles.metaRow}>
              <Muted style={{ flex: 1, fontSize: 13 }}>{countText}</Muted>
              {/* 軸は登録日だけ。押すたびに新しい順 ↔ 古い順が入れ替わる */}
              <SortControls
                axes={SORT_AXES}
                field="created"
                direction={direction}
                onChange={(_field, nextDirection) => setDirection(nextDirection)}
              />
            </View>

            {/* 押しても並びが変わらない理由を出す。黙って別の順に落ちると故障に見える */}
            {!canSortByCreated && (
              <View style={styles.sortNote}>
                <Ionicons name="information-circle-outline" size={14} color={color.orange500} />
                <Text style={styles.sortNoteLabel}>
                  登録日が記録されていないため、並び替えは反映されません
                </Text>
              </View>
            )}
          </>
        )}
      </Appear>

      <FlashList
        ref={listRef}
        data={visibleStores}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        ListEmptyComponent={
          /*
            ⚠️ **担当店舗（011）が 0 件でも同じ「0 件」になる。**
               `getStores` が担当ぶんしか返さないので、アプリからは
               「組織に店舗が無い」のか「自分が担当していない」のか区別が付かない。
               管理者は常に全店舗なので、**非管理者のときは担当を疑うほうが当たる。**
            ⚠️ 文面と「登録する」ボタンの出し分けは NoStoresNotice に集約してある
               （ホーム・管理と同じものを出す）。ここに書き写さないこと。
          */
          !hasStores ? (
            <NoStoresNotice isAdmin={canAddStore} />
          ) : (
            <Card>
              {query.trim() ? (
                <>
                  <Muted>「{query.trim()}」に一致する店舗がありません</Muted>
                  <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>
                    別のキーワードで検索してみてください
                  </Muted>
                </>
              ) : region !== null ? (
                /* 絞り込んだ地域の店舗が消えた（他の条件と重なった / 住所を直した）とき。
                   何で 0 件になっているのかを出さないと、店舗ごと消えたように見える */
                <>
                  <Muted>{regionLabel ?? "この地域"}の店舗がありません</Muted>
                  <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>
                    上のタブから別の地域を選んでください
                  </Muted>
                </>
              ) : (
                <Muted>該当する店舗がありません</Muted>
              )}
            </Card>
          )
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
            /* ⚠️ 直接 push しない。支払方法がある店舗では何を集金するか聞く */
            onCollect={() => collect.launch(item)}
          />
        )}
      />

      <CollectScopeSheet {...collect.sheetProps} />

      {/* 店舗の追加。Web の AddBtn と同じ右下固定の丸ボタン。admin だけに出す。
          ⚠️ **上限に達していたらプラン画面へ送る**（2026-08-05。書き出しと同じ扱い）。
             それまでは「移植しない（Guideline 3.1.3(a)）」としていたが、**その理由は
             誤り。** 3.1.3(a) が禁じるのは**アプリ外**の購入手段への誘導で、
             アプリ内課金の画面へ送ることではない。送らないと、上限に達した人は
             **何をすれば増やせるのか分からないまま**登録に失敗する。 */}
      {canAddStore && (
        <Pressable
          onPress={() => router.push(atStoreLimit ? "/settings/plan" : "/stores/new")}
          accessibilityLabel={atStoreLimit ? "店舗数の上限。プランを見る" : "店舗を追加"}
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name={atStoreLimit ? "lock-closed" : "add"} size={26} color="#FFFFFF" />
          <Text style={styles.fabLabel}>{atStoreLimit ? "上限" : "追加"}</Text>
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
