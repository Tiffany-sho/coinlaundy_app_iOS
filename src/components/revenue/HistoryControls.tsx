import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  SortControls,
  type SortAxis,
  type SortDirection,
} from "@/components/common/SortControls";
import * as Haptics from "expo-haptics";
import { Chip } from "@/components/common/Chip";
import { useDialog } from "@/components/common/dialog";
import { CASH_METHOD_KEY, methodKeyOf } from "@/api/types";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 売上履歴の並び替えと担当者の絞り込み。
 *
 * 軸は集金日と売上の 2 つ。効いている方をもう一度押すと逆順になる。
 *
 * ⚠️ 並び替えの実体はサーバの ORDER BY（useFundHistory が order / asc を渡す）。
 *    手元のぶんだけ並べ替えないこと。「売上が高い順」の先頭が、取ってきた期間の中の
 *    最高額でしかなくなる。本家（getOrgCollectFundsInPeriod）も DB に並べさせている。
 *
 * 担当者は選択肢が可変なのでトグルにできない。ダイアログのまま。
 */

export type HistorySortField = "date" | "amount";

/** 「すべての担当者」を表す番兵。ダイアログは null をキャンセルに使うので別の値が要る */
const ALL_COLLECTERS = "__ALL_COLLECTERS__";

const SORT_AXES = [
  {
    value: "date",
    label: "集金日",
    hint: { desc: "新しい順", asc: "古い順" },
    defaultDirection: "desc",
  },
  {
    value: "amount",
    label: "売上",
    hint: { desc: "高い順", asc: "低い順" },
    defaultDirection: "desc",
  },
] as const satisfies readonly SortAxis<HistorySortField>[];

export function HistoryControls({
  sortField,
  sortDirection,
  onSortChange,
  collecter,
  collecterOptions,
  onCollecterChange,
  methodNames = [],
  methods = [],
  onMethodsChange,
}: {
  sortField: HistorySortField;
  sortDirection: SortDirection;
  onSortChange: (field: HistorySortField, direction: SortDirection) => void;
  /** null = 担当者で絞り込まない */
  collecter: string | null;
  /** 実際に集金した人の名前。メンバー一覧ではなく実績から作る */
  collecterOptions: string[];
  onCollecterChange: (next: string | null) => void;
  /**
   * 支払方法の名前（現金は含めない。ここで先頭に足す）。
   * ⚠️ **空なら行ごと出さない。** 現金しか扱わない組織で 1 段無駄に伸びるだけ。
   */
  methodNames?: string[];
  /** 選択中のキー。⚠️ **空配列 = 絞らない**（複数選べる） */
  methods?: string[];
  onMethodsChange?: (next: string[]) => void;
}) {
  const dialog = useDialog();

  async function pickCollecter() {
    const picked = await dialog.choose<string>({
      title: "集金担当者で絞り込む",
      message: collecterOptions.length === 0 ? "表示できる集金データがありません" : undefined,
      options: [
        { label: "すべての担当者", value: ALL_COLLECTERS, selected: collecter === null },
        ...collecterOptions.map((name) => ({
          label: name,
          value: name,
          selected: collecter === name,
        })),
      ],
    });
    if (picked === null) return;
    onCollecterChange(picked === ALL_COLLECTERS ? null : picked);
  }

  /** ⚠️ もう一度押したら外す。「すべて」に戻す手段を必ず残すこと */
  function toggleMethod(key: string) {
    if (!onMethodsChange) return;
    Haptics.selectionAsync().catch(() => {});
    onMethodsChange(
      methods.includes(key) ? methods.filter((k) => k !== key) : [...methods, key]
    );
  }

  return (
    <>
    <View style={styles.row}>
      <SortControls
        axes={SORT_AXES}
        field={sortField}
        direction={sortDirection}
        onChange={onSortChange}
      />

      <Pressable
        onPress={() => void pickCollecter()}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.control,
          collecter !== null && styles.controlActive,
          pressed && { opacity: 0.75 },
        ]}
      >
        <Ionicons
          name="person-outline"
          size={14}
          color={collecter !== null ? color.cyan700 : color.textMuted}
        />
        <Text
          style={[styles.controlLabel, collecter !== null && styles.controlLabelActive]}
          numberOfLines={1}
        >
          {collecter ?? "担当者"}
        </Text>
        <Ionicons
          name="chevron-down"
          size={13}
          color={collecter !== null ? color.cyan700 : color.textFaint}
        />
      </Pressable>
    </View>

    {/*
      支払方法の絞り込み。**複数選べる。**
      ⚠️ **「含む」で絞る（一致ではない）。** 現金と PayPay の両方で受け取った
         集金は、どちらで絞っても出る。**行の金額は総額のまま**なので、
         絞り込んだ結果を足しても選んだ方法の合計にはならない。
         だから行に内訳を出している（`methodFilter.ts` の `matchesMethods`）。
      ⚠️ 支払方法が 1 つも無い組織ではこの行ごと出さない。
    */}
    {methodNames.length > 0 && onMethodsChange && (
      <View style={styles.methodRow}>
        <Chip label="すべて" selected={methods.length === 0} onPress={() => onMethodsChange([])} />
        <Chip
          label="現金"
          selected={methods.includes(CASH_METHOD_KEY)}
          onPress={() => toggleMethod(CASH_METHOD_KEY)}
        />
        {methodNames.map((name) => (
          <Chip
            key={name}
            label={name}
            selected={methods.includes(methodKeyOf(name))}
            onPress={() => toggleMethod(methodKeyOf(name))}
          />
        ))}
      </View>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  /* ⚠️ 折り返す。方法が増えると横に収まらない（横スクロールにすると気づかれない） */
  methodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  control: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.divider,
    backgroundColor: color.cardBg,
    maxWidth: "60%",
  },
  controlActive: { borderColor: color.cyan400, backgroundColor: color.cyan50 },
  controlLabel: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, flexShrink: 1 },
  controlLabelActive: { fontFamily: font.uiBold, color: color.cyan700 },
});
