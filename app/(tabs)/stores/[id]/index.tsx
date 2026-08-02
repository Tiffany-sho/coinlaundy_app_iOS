import { useMemo, useState } from "react";
import {
  Dimensions,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  activePaymentMethods,
  useBootstrap,
  useLaundryStates,
  useStore,
  useStoreRevenue,
} from "@/api/queries";
import { ApiError } from "@/api/client";
import { MachineListSheet } from "@/components/stores/MachineListSheet";
import {
  CollectScopeSheet,
  useCollectLauncher,
} from "@/components/collect/CollectScopeSheet";
import { StoreImageCarousel } from "@/components/stores/StoreImageCarousel";
import { StateEditSheet, type StateEditMode } from "@/components/manage/StateEditSheet";
import { useDialog } from "@/components/common/dialog";
import { useDeleteStoreAction } from "@/components/stores/useDeleteStoreAction";
import { CenterMessage, Screen } from "@/components/common/ui";
import { color, font, radius, shadow, spacing, numeric } from "@/theme/tokens";

const NO_IMAGE =
  "https://hhdipgftsrsmmuqyifgt.supabase.co/storage/v1/object/public/Laundry-Images/public/no-image.png";

const SCREEN_WIDTH = Dimensions.get("window").width;

/**
 * 店舗詳細。Web の MonoCard.jsx に構造を合わせてある。
 *   画像カルーセル → 店名（{store}店）→ 住所 → 説明 → 情報タイル 4 枚 → 集金ボタン
 *
 * タイルの並びも Web の Grid と同じ順（総売上 / 設置機種 / 在庫状況 / 設備状況 =
 * MonoDataTotal / HaveMachines / NowLaundryNum / MachinesState）。
 *
 * ── ルート構成について ──
 * もとは app/stores/[id].tsx → app/stores/[id]/index.tsx と動かしてきたが、
 * (tabs) の外にあるとタブバー（フッター）が出ないので
 * app/(tabs)/stores/[id]/index.tsx へ移し、店舗タブの中の Stack の 1 画面にした。
 * (tabs) は URL に出ないグループなので /stores/:id のまま。ディープリンクも変わらない。
 * 詳しい経緯は app/(tabs)/stores/_layout.tsx を見ること。
 *
 * ⚠️ タイルは 4 枚とも押せる。Web も MonoCard の中の 4 つのカードがそれぞれ
 *    リンク・Drawer・Dialog のトリガーになっている。
 *    総売上 → 収益ページ（MonoDataTotal の「収益レポートへ」）
 *    設置機種 → 設備一覧シート（HaveMachines の Drawer）
 *    在庫状況 / 設備状況 → 編集シート（NowLaundryNum / MachinesState の Dialog）
 */
export default function StoreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, error } = useStore(id);
  const bootstrap = useBootstrap();
  const states = useLaundryStates(Boolean(id));
  const revenue = useStoreRevenue();

  /** 編集シートで開いているタブ。null なら閉じている */
  const [editingMode, setEditingMode] = useState<StateEditMode | null>(null);
  /** 設置機種の詳細シートを開いているか */
  const [machinesOpen, setMachinesOpen] = useState(false);
  /* ⚠️ 集金への遷移はこれを通す。支払方法がある店舗では何を集金するか聞く */
  const collect = useCollectLauncher();

  const myRole = bootstrap.data?.organization?.myRole;
  const canEdit = myRole !== "viewer";
  // 権限は UI の出し分けにだけ使う。正は Server Action 側（admin 以外は updateStore / deleteStore が弾く）
  const isAdmin = myRole === "admin";

  const dialog = useDialog();
  const { confirmDelete } = useDeleteStoreAction(id, data?.store ?? "");

  /** 編集 / 削除。Web の ActionMenu と同じ 2 択 */
  async function openActionMenu() {
    const picked = await dialog.choose<"edit" | "delete">({
      title: `${data?.store ?? ""}店`,
      options: [
        { label: "店舗情報を編集", value: "edit" },
        { label: "この店舗を削除", value: "delete", destructive: true },
      ],
    });
    if (picked === "edit") router.push({ pathname: "/stores/[id]/edit", params: { id } });
    // 削除の確認（2 段階）は useDeleteStoreAction 側。編集ページと同じものを使う
    if (picked === "delete") await confirmDelete();
  }

  // laundry_state.laundryId は laundry_store.id と同じ値。
  // BFF の /states は getStores() で取った店舗 ID で laundry_state を引いている
  // （laundryState/action.js の getAllLaundryStates）ので、店舗詳細の id をそのまま使える。
  const state = states.data?.find((s) => s.laundryId === id);

  /**
   * この店舗の**全期間**の売上総額と集金回数。
   *
   * ⚠️ **`useFundList` から出さないこと。** 2 つの理由で必ず実際より小さくなる:
   *   1. 無限スクロールで**読み込み済みのページしか手元に無い**（初回は 30 件）
   *   2. ⚠️ そもそも `GET /funds` の `offset` + `limit` は**直近 2 か月しか返さない**
   *      （`getStoreFundsPaginated` が startEpoch を固定している）。
   *      ページを最後までめくっても、それより古い集金には**絶対に届かない**
   *
   * 実際これで「総売上」に**最初の 30 件ぶんの合計**が出ていた。
   * `/funds/summary/stores` は全件を店舗ごとに畳んだものなので、これが正。
   * 収益ページ（`funds.tsx`）も同じものを使っている。
   *
   * ⚠️ 集金実績のある店舗しか返らないので、1 件も無い店舗では undefined になる。
   * ⚠️ `count` は後から足した項目で、**MMKV に残る前のバージョンのキャッシュには無い**。
   *    `?? 0` を外すと起動直後に NaN が出る（docs/traps.md の永続キャッシュの節）。
   */
  const summary = useMemo(
    () => (revenue.data ?? []).find((s) => s.laundryId === id),
    [revenue.data, id]
  );
  const total = summary?.total ?? 0;
  const count = summary?.count ?? 0;

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

  if (!data) return null;

  const images = (data.images ?? []).filter((img) => typeof img?.url === "string");

  function openMap() {
    if (!data?.location) return;
    const query = encodeURIComponent(data.location);
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    Linking.openURL(url).catch(() => {});
  }

  const lowStock = state
    ? (state.detergent ?? 0) <= (state.stock_thresholds?.detergent ?? 1) ||
      (state.softener ?? 0) <= (state.stock_thresholds?.softener ?? 1)
    : false;
  const brokenCount = (state?.machines ?? []).filter((m) => m.break).length;
  /* ⚠️ 現金は含まれない（暗黙の方法）。使用停止のものも出さない */
  const paymentMethods = activePaymentMethods(data);

  return (
    <Screen>
      {/* タブバーは画面の下に「並ぶ」ので（重ならない）、下端の余白に insets.bottom は足さない。
          足すと最後の「集金する」の下に安全領域ぶんの空白が二重に入る */}
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {/*
          画像カルーセル。Web は 16:9 で横スワイプ。
          ⚠️ 上と左右に余白を取る。画面の端まで画像を伸ばすとステータスバーの
             真下から始まって見づらく、戻る／メニューのボタンも写真に埋もれる。
        */}
        <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg }}>
          <StoreImageCarousel
            images={images}
            width={SCREEN_WIDTH - spacing.lg * 2}
            fallbackUrl={NO_IMAGE}
          >
            {/* 位置は画像の内側。カルーセルの上に重ねる */}
            <Pressable
              onPress={() => router.back()}
              style={[styles.floatingBack, { top: spacing.sm }]}
              hitSlop={12}
            >
              <Ionicons name="chevron-back" size={22} color={color.textMain} />
            </Pressable>

            {/* Web の MonoCard も isOwner のときだけ ActionMenu（編集 / 削除）を出す */}
            {isAdmin && (
              <Pressable
                onPress={() => void openActionMenu()}
                style={[styles.floatingMenu, { top: spacing.sm }]}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="店舗の操作"
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={color.textMain} />
              </Pressable>
            )}
          </StoreImageCarousel>
        </View>

        <View style={{ padding: spacing.lg }}>
          <Text style={styles.storeName}>{data.store}店</Text>

          <Pressable onPress={openMap} style={styles.locationRow}>
            <Ionicons name="location-outline" size={17} color={color.textMuted} />
            <Text style={styles.location}>{data.location ?? "住所未登録"}</Text>
            {data.location ? (
              <Ionicons name="open-outline" size={14} color={color.teal} />
            ) : null}
          </Pressable>

          {data.description ? <Text style={styles.description}>{data.description}</Text> : null}

          {/* 情報タイル。Web は 2 列グリッド */}
          <View style={styles.grid}>
            {/* この店舗だけの収益。Web も MonoDataTotal.jsx の総売上カードの中から
                /coinLaundry/{id}/coinDataList へ「収益レポートへ」で送っている */}
            <Tile
              label="総売上"
              actionIcon={null}
              onPress={() =>
                router.push({ pathname: "/stores/[id]/funds", params: { id: data.id } })
              }
            >
              {/* ⚠️ 取得前に ¥0 を出さない。実際に 0 円なのか未取得なのか区別が付かない */}
              <Text style={styles.tileMoney}>
                {revenue.isLoading && !revenue.data ? "—" : `¥${total.toLocaleString()}`}
              </Text>
              <Text style={styles.tileSub}>
                {/* ⚠️「直近」と書かない。全期間の合計になった */}
                {count > 0 ? `全 ${count}回の集金` : "集金データがありません"}
              </Text>
              <View style={styles.tileLink}>
                <Text style={styles.tileLinkLabel}>収益レポートへ</Text>
                <Ionicons name="chevron-forward" size={12} color={color.teal} />
              </View>
            </Tile>

            {/* Web の HaveMachines.jsx（設備情報カード）と同じで、押すと機種の一覧が出る */}
            <Tile label="設置機種" actionIcon="construct" onPress={() => setMachinesOpen(true)}>
              <Text style={styles.tileNumber}>{data.machines?.length ?? 0}</Text>
              <Text style={styles.tileSub} numberOfLines={2}>
                {(data.machines ?? []).map((m) => m.name).join("・") || "未登録"}
              </Text>
              <Text style={styles.tileHint}>タップして詳細を表示</Text>
            </Tile>

            {/* state が取れていないと更新先の laundryId が決まらないので押せなくする */}
            <Tile label="在庫状況" onPress={state ? () => setEditingMode("stock") : undefined}>
              <Text style={[styles.tileStatus, { color: lowStock ? color.orange500 : color.tealDeeper }]}>
                {state ? (lowStock ? "補充が必要" : "問題なし") : "—"}
              </Text>
              <Text style={styles.tileSub}>
                {state ? `洗剤 ${state.detergent ?? 0}・柔軟剤 ${state.softener ?? 0}` : ""}
              </Text>
            </Tile>

            <Tile label="設備状況" onPress={state ? () => setEditingMode("equipment") : undefined}>
              <Text style={[styles.tileStatus, { color: brokenCount > 0 ? color.orange500 : color.tealDeeper }]}>
                {state ? (brokenCount > 0 ? `${brokenCount}台 故障中` : "異常なし") : "—"}
              </Text>
              <Text style={styles.tileSub}>
                {state ? `全 ${(state.machines ?? []).length}台` : ""}
              </Text>
            </Tile>

            {/*
              支払方法。⚠️ **現金は行として持っていない**（常に記録される暗黙の方法）ので、
              ここに出るのは現金以外だけ。「現金のみ」は 0 件と同じ意味。
              ⚠️ 使用停止にしたもの（`isActive: false`）は出さない。過去の集金には
              残っているが、これから使う方法の一覧なので混ぜない。
            */}
            <Tile label="支払方法">
              <Text style={styles.tileStatus}>
                {paymentMethods.length === 0 ? "現金のみ" : `現金 + ${paymentMethods.length}種類`}
              </Text>
              <Text style={styles.tileSub} numberOfLines={2}>
                {paymentMethods.map((m) => m.name).join("・") || "現金以外の登録はありません"}
              </Text>
              {canEdit && <Text style={styles.tileHint}>編集画面から追加できます</Text>}
            </Tile>
          </View>

          {canEdit && (
            <Pressable
              /* ⚠️ 直接 push しない。支払方法がある店舗では何を集金するか聞く */
              onPress={() => collect.launch(data)}
              style={({ pressed }) => [pressed && { opacity: 0.85 }, { marginTop: spacing.xl }]}
            >
              <LinearGradient
                colors={["#0891B2", "#0E7490"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.collectButton}
              >
                <Ionicons name="cash-outline" size={20} color="#FFFFFF" />
                <Text style={styles.collectLabel}>集金する</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <CollectScopeSheet {...collect.sheetProps} />

      <MachineListSheet
        visible={machinesOpen}
        storeName={data.store}
        machines={data.machines ?? []}
        onClose={() => setMachinesOpen(false)}
      />

      <StateEditSheet
        state={editingMode ? state ?? null : null}
        mode={editingMode ?? "stock"}
        onOpenSettings={() =>
          router.push({ pathname: "/manage/[laundryId]", params: { laundryId: id } })
        }
        canEdit={canEdit}
        onClose={() => setEditingMode(null)}
      />
    </Screen>
  );
}

/**
 * onPress を渡したタイルだけ押せる。
 * 右上のアイコンは既定が鉛筆（＝その場で編集できる）。編集ではないタイルは
 * actionIcon で差し替えるか、null を渡して消す。
 */
function Tile({
  label,
  children,
  onPress,
  actionIcon = "create-outline",
}: {
  label: string;
  children: React.ReactNode;
  onPress?: () => void;
  actionIcon?: React.ComponentProps<typeof Ionicons>["name"] | null;
}) {
  const body = (
    <>
      <View style={styles.tileHead}>
        <Text style={styles.tileLabel}>{label}</Text>
        {onPress && actionIcon && <Ionicons name={actionIcon} size={14} color={color.teal} />}
      </View>
      <View style={{ marginTop: spacing.sm }}>{children}</View>
    </>
  );

  if (!onPress) return <View style={styles.tile}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, styles.tileTappable, pressed && { opacity: 0.85 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  floatingBack: {
    position: "absolute",
    left: spacing.md,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  /* 戻るボタンと同じ見た目で画像の右上に置く */
  floatingMenu: {
    position: "absolute",
    right: spacing.md,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  storeName: {
    fontFamily: font.uiBold,
    fontSize: 26,
    color: color.textMain,
    letterSpacing: -0.5,
    marginBottom: spacing.md,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 40 },
  location: { fontFamily: font.uiBold, fontSize: 14, color: color.textMuted, flexShrink: 1 },
  description: {
    fontFamily: font.ui,
    fontSize: 15,
    lineHeight: 24,
    color: color.textMuted,
    marginTop: spacing.md,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xl },
  tile: {
    width: "47.5%",
    flexGrow: 1,
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.lg,
    ...shadow.sm,
  },
  // 押せるタイルは枠を濃くする。Web も押せるカードだけ枠が 2px
  tileTappable: { borderWidth: 2, borderColor: color.cyan200 },
  tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.textMuted },
  tileMoney: { ...numeric, fontSize: 22, color: color.tealDeeper },
  tileNumber: { ...numeric, fontSize: 24, color: color.tealDeeper },
  tileStatus: { fontFamily: font.uiBold, fontSize: 16 },
  tileSub: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 2 },
  // 押した先があることを文字でも出す。アイコンだけだと現場で気付かれない
  tileLink: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: spacing.sm },
  tileLinkLabel: { fontFamily: font.uiBold, fontSize: 11, color: color.teal },
  tileHint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, marginTop: spacing.sm },
  collectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.card,
    ...shadow.hero,
  },
  collectLabel: { fontFamily: font.uiBold, fontSize: 17, color: "#FFFFFF" },
});
