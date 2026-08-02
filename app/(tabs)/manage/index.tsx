import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useScrollToTop } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Appear } from "@/components/common/Appear";
import { useBootstrap, useLaundryStates } from "@/api/queries";
import { ApiError } from "@/api/client";
import { useOutbox } from "@/offline/OutboxProvider";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { StateEditSheet, type StateEditMode } from "@/components/manage/StateEditSheet";
import { brokenMachines, isLowStock, stockDisplayItems } from "@/components/manage/laundryState";
import { Card, CenterMessage, Muted, OfflineBanner, Screen, Title } from "@/components/common/ui";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { LaundryState } from "@/api/types";

const SEGMENTS = [
  { value: "stock", label: "在庫" },
  { value: "equipment", label: "設備" },
] as const satisfies readonly { value: StateEditMode; label: string }[];

/**
 * 在庫 / 設備。Web では別ページだが Footer 上は同じ「管理」タブなので統合する。
 *
 * カードの見た目は Web の InventoryStoreCard / MachinesState に合わせてある。
 *   正常   … cyan 系の背景 + チェックアイコン
 *   要対応 … orange 系の背景 + 警告アイコン
 * タップすると編集用のシートが開く（Web は Dialog）。
 *
 * ⚠️ 編集シートは店舗詳細と共通の StateEditSheet を使う。
 *    ここに 2 つ目のシートを作らないこと。在庫の保存は 4 項目まとめて送る必要があり
 *    （src/components/manage/laundryState.ts のコメント参照）、実装が分かれると片方だけ
 *    追加在庫を消す事故が起きる。
 */
export default function Manage() {
  const insets = useSafeAreaInsets();
  /** タブをもう一度押したら先頭へ戻す（今いる画面がタブの 1 枚目のときだけ動く） */
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const router = useRouter();
  const [segment, setSegment] = useState<StateEditMode>("stock");
  /**
   * ホームの「在庫状況 / 設備状況」から開いたときに、そのタブを出す。
   *
   * ⚠️ **この画面はタブバーの下でマウントされたまま残る。** つまり segment は
   *    前に開いたときの値を保持していて、何も渡さないと「在庫状況を押したのに
   *    設備が出る」ことになる（キャッシュではなく生きた state が残るのが原因）。
   * ⚠️ t は呼び出し側が毎回変える値。同じ tab を続けて押しても params が
   *    変わらないと、この効果が再実行されない。
   */
  const { tab, t } = useLocalSearchParams<{ tab?: string; t?: string }>();
  useEffect(() => {
    if (tab === "stock" || tab === "equipment") setSegment(tab);
  }, [tab, t]);

  const { data, isLoading, error, refetch, isRefetching } = useLaundryStates();
  const bootstrap = useBootstrap();
  const { isOnline } = useOutbox();

  /** 編集中の店舗 ID。一覧が更新されても最新の値を渡せるよう ID だけ持つ */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = data?.find((s) => s.laundryId === editingId) ?? null;

  // viewer は読み取り専用。Web の inventory/page.jsx も myRole !== "viewer" で canEdit を決めている
  const canEdit = bootstrap.data?.organization?.myRole !== "viewer";
  /** 空表示の文言を分けるのに使う。管理者は常に全店舗を見る（011） */
  const isAdmin = bootstrap.data?.organization?.myRole === "admin";

  return (
    <Screen>
      {!isOnline && <OfflineBanner />}
      <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg }}>
        <Title style={{ marginBottom: spacing.md, fontSize: 22 }}>管理</Title>
        <SegmentedTabs options={SEGMENTS} value={segment} onChange={setSegment} />
      </View>

      {isLoading && !data ? (
        <CenterMessage text="読み込み中…" />
      ) : error && !data ? (
        <CenterMessage
          text={error instanceof ApiError ? error.message : "状況を取得できませんでした"}
        />
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={color.teal} />
          }
        >
          {!isOnline && (
            <Card style={{ marginBottom: spacing.md }}>
              <Muted>オフラインでは変更できません。集金の登録のみ送信待ちに追加できます。</Muted>
            </Card>
          )}

          {/*
            ⚠️ **Appear は条件分岐の外側に置く。** 在庫 / 設備を切り替えると
               中身は別のコンポーネントになって作り直されるが、Appear 自身は
               残るので**初回の 1 度しか動かない。** 内側に置くと切り替えるたびに
               全カードが出直してうるさくなる。
            ⚠️ ここは仮想化していない ScrollView なので 1 枚ずつずらしてよい。
               FlashList の行では使い回しのせいで再生され直す（Appear のコメント参照）。
          */}
          {(data ?? []).map((state, i) => (
            <Appear key={state.laundryId} index={i}>
              {segment === "stock" ? (
                <StockSummaryCard
                  state={state}
                  onPress={() => setEditingId(state.laundryId)}
                />
              ) : (
                <EquipmentSummaryCard
                  state={state}
                  onPress={() => setEditingId(state.laundryId)}
                />
              )}
            </Appear>
          ))}

          {(data?.length ?? 0) === 0 && (
            <Card>
              {/* ⚠️ 担当店舗が 0 件でも同じ 0 件になる（店舗一覧と同じ理由）。
                     非管理者には割り当てを疑えるように書く */}
              <Muted>
                {isAdmin ? "店舗がありません" : "担当する店舗がありません"}
              </Muted>
              {!isAdmin && (
                <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>
                  担当する店舗は店舗管理者が割り当てます。
                </Muted>
              )}
            </Card>
          )}
        </ScrollView>
      )}

      <StateEditSheet
        state={editing}
        mode={segment}
        canEdit={canEdit}
        onClose={() => setEditingId(null)}
        onOpenSettings={() =>
          editing &&
          router.push({
            pathname: "/manage/[laundryId]",
            params: { laundryId: editing.laundryId },
          })
        }
      />
    </Screen>
  );
}

/** 在庫サマリ。Web は「洗剤: 3　柔軟剤: 2」を横並びで出す（追加在庫も同じ並びに混ぜる） */
function StockSummaryCard({ state, onPress }: { state: LaundryState; onPress: () => void }) {
  const items = stockDisplayItems(state);

  return (
    <StatusCard title={`${state.laundryName}店`} isAlert={isLowStock(state)} onPress={onPress}>
      <View style={styles.inlineItems}>
        {items.map((item, i) => (
          <Text key={i} style={[styles.inlineItem, { color: item.isLow ? "#C2410C" : "#0E7490" }]}>
            {item.label}: {item.value}
          </Text>
        ))}
      </View>
    </StatusCard>
  );
}

/** 設備サマリ。Web は故障機の名前を 1 台だけ出して残りは「他 N台」 */
function EquipmentSummaryCard({ state, onPress }: { state: LaundryState; onPress: () => void }) {
  const broken = brokenMachines(state);
  const isAlert = broken.length > 0;

  return (
    <StatusCard title={`${state.laundryName}店`} isAlert={isAlert} onPress={onPress}>
      {isAlert ? (
        <View style={styles.inlineItems}>
          <Text style={[styles.inlineItem, { color: "#C2410C" }]}>{broken[0].name.slice(0, 8)}</Text>
          {broken.length > 1 && (
            <Text style={[styles.inlineItem, { color: "#C2410C" }]}>他 {broken.length - 1}台</Text>
          )}
        </View>
      ) : (
        <Text style={[styles.inlineItem, { color: "#0E7490" }]}>異常なし</Text>
      )}
    </StatusCard>
  );
}

function StatusCard({
  title,
  isAlert,
  children,
  onPress,
}: {
  title: string;
  isAlert: boolean;
  children: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.statusCard,
        {
          backgroundColor: isAlert ? "#FFF7ED" : "#ECFEFF",
          borderColor: isAlert ? color.orange200 : color.cyan200,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.statusTitle}>{title}</Text>
        <View style={{ marginTop: 4 }}>{children}</View>
      </View>
      <View style={[styles.statusIcon, { backgroundColor: isAlert ? color.orange500 : "#06B6D4" }]}>
        <Ionicons name={isAlert ? "alert-circle-outline" : "checkmark"} size={16} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 2,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  statusTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  statusIcon: { borderRadius: radius.pill, padding: 6 },
  inlineItems: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  inlineItem: { fontFamily: font.ui, fontSize: 12 },
});
