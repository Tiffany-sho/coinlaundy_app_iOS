import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLaundryStates, useStores } from "@/api/queries";
import { StateEditSheet, type StateEditMode } from "@/components/manage/StateEditSheet";
import { StorePickerSheet, type StorePickerMode } from "@/components/home/StorePickerSheet";
import type { Role } from "@/api/types";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";

/**
 * クイックアクション。Web の LoginUserHome/QuickAction.jsx と
 * QuickActionDialog.jsx を移したもの。
 *
 * 本家は 4 つのボタンを並べ、押すと「店舗を選ぶダイアログ」が開いて
 * 選んだ店舗のページへ飛ぶ、という作り。並びと文言はそのまま合わせてある。
 *   集金 / 在庫・設備管理 / 店舗一覧 / レポート
 * 集金と在庫・設備管理は viewer には出さない（本家の `!isViewer && ...`）。
 *
 * 行き先だけはアプリの画面構成に読み替えている。
 *   /collectMoney/{id}/newData     → /collect/[storeId]
 *   /coinLaundry/{id}/coinDataList → /stores/[id]/funds
 *
 * 在庫・設備管理だけは**遷移しない**。店舗と「在庫 / 設備」を選ぶとその場で
 * StateEditSheet が開く（管理タブ・店舗詳細と同じシート）。
 */

const STATE_MODES = [
  { value: "stock", label: "在庫" },
  { value: "equipment", label: "設備" },
] as const satisfies readonly StorePickerMode<StateEditMode>[];

type QuickActionDef = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  /** 店舗を選ばせるシートの見出し。本家の dialogTitle と同じ文言 */
  pickerTitle: string;
  /** viewer には出さない操作 */
  hideForViewer?: boolean;
  /** 店舗を選んだあとの行き先。在庫・設備管理は遷移しないので持たない */
  href?: (storeId: string) => Href;
  /** true なら店舗行に「在庫 / 設備」を並べ、その場で編集シートを開く */
  opensStateSheet?: boolean;
};

const ACTIONS: QuickActionDef[] = [
  {
    key: "collect",
    label: "集金",
    icon: "cash-outline",
    pickerTitle: "集金したい店舗を選択してください",
    hideForViewer: true,
    href: (storeId) => ({ pathname: "/collect/[storeId]", params: { storeId } }),
  },
  {
    key: "stock",
    label: "在庫・設備管理",
    icon: "cube-outline",
    pickerTitle: "編集したい店舗と項目を選んでください",
    hideForViewer: true,
    opensStateSheet: true,
  },
  {
    key: "store",
    label: "店舗一覧",
    icon: "storefront-outline",
    pickerTitle: "店舗を選択すると詳細ページに行きます",
    href: (id) => ({ pathname: "/stores/[id]", params: { id } }),
  },
  {
    key: "report",
    label: "レポート",
    icon: "stats-chart-outline",
    pickerTitle: "店舗を選択すると集金データを見れます",
    href: (id) => ({ pathname: "/stores/[id]/funds", params: { id } }),
  },
];

type SheetTarget = { laundryId: string; mode: StateEditMode };

export function QuickActions({ myRole }: { myRole: Role | null | undefined }) {
  const router = useRouter();
  const [picker, setPicker] = useState<QuickActionDef | null>(null);
  /** 店舗選択シートが閉じ切るのを待っている編集シート */
  const [pending, setPending] = useState<SheetTarget | null>(null);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);

  /**
   * 店舗一覧はボタンを押すまで取りに行かない。ホームの起動時に 1 本増やすより、
   * 押した瞬間に取る方が体感が軽い（前回のキャッシュがあれば即出る）。
   */
  const stores = useStores(picker !== null);
  /** 在庫・設備の編集に必要。こちらもシートを開くときだけ取る */
  const states = useLaundryStates(picker?.opensStateSheet === true || sheet !== null);

  const isViewer = myRole === "viewer";
  const actions = ACTIONS.filter((action) => !(isViewer && action.hideForViewer));

  /**
   * ⚠️ iOS は Modal の上に Modal を重ねると表示に失敗する。
   *    店舗選択シートが閉じ切ってから編集シートを開く。
   *    onDismiss は iOS だけなので、他プラットフォームは閉じた次のフレームで開く。
   */
  function openPending() {
    setPending((target) => {
      if (target) setSheet(target);
      return null;
    });
  }

  useEffect(() => {
    if (Platform.OS === "ios" || pending === null || picker !== null) return;
    const id = requestAnimationFrame(openPending);
    return () => cancelAnimationFrame(id);
  }, [pending, picker]);

  function open(action: QuickActionDef) {
    Haptics.selectionAsync().catch(() => {});
    setPicker(action);
  }

  function pick(storeId: string, mode?: StateEditMode) {
    const target = picker;
    setPicker(null);
    if (!target) return;

    if (target.opensStateSheet) {
      if (mode) setPending({ laundryId: storeId, mode });
      return;
    }
    if (target.href) router.push(target.href(storeId));
  }

  const editing = sheet
    ? states.data?.find((state) => state.laundryId === sheet.laundryId) ?? null
    : null;

  return (
    <View style={styles.grid}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={() => open(action)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        >
          <Ionicons name={action.icon} size={24} color={color.teal} />
          <Text style={styles.tileLabel} numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ))}

      <StorePickerSheet
        visible={picker !== null}
        title={picker?.pickerTitle ?? ""}
        stores={(stores.data ?? []).map((store) => ({ id: store.id, name: store.store }))}
        isLoading={stores.isFetching && !stores.data}
        emptyText={stores.error ? "店舗を取得できませんでした" : "店舗がありません"}
        modes={picker?.opensStateSheet ? STATE_MODES : undefined}
        onPick={pick}
        onClose={() => setPicker(null)}
        onDismiss={openPending}
      />

      {/* 管理タブ・店舗詳細と同じシート。在庫の保存は 4 項目まとめて送る必要があるので
          ここに 2 つ目の実装を作らないこと（StateEditSheet 側のコメント参照） */}
      <StateEditSheet
        state={editing}
        mode={sheet?.mode ?? "stock"}
        canEdit={!isViewer}
        onClose={() => setSheet(null)}
        onOpenSettings={() =>
          sheet &&
          router.push({
            pathname: "/manage/[laundryId]",
            params: { laundryId: sheet.laundryId },
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 本家は base で 2 列（md で 4 列）。アプリは常に 2 列で並べる
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.cyan100,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    ...shadow.sm,
  },
  tilePressed: { opacity: 0.85, backgroundColor: color.cyan50 },
  tileLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain },
});
