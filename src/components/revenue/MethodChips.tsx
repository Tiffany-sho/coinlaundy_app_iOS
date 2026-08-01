import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { CASH_METHOD_KEY, type PaymentMethod } from "@/api/types";
import { color, font, radius, spacing } from "@/theme/tokens";

/** 「すべて」を表す値。⚠️ 空文字にしない（`||` で誤って falsy 扱いされる） */
export const ALL_METHODS = "__all__";

/**
 * 支払方法の絞り込みチップ。月別売上の上に置く。
 *
 * ⚠️ **「すべて」以外を選ぶと店舗別の内訳が出せない。** 応答の `byStore` と
 *    `byMethod` は独立した畳み方で、「この店舗の PayPay」はデータとして存在しない。
 *    呼び出し側は方法を選んだ時点で**店舗の選択を解除する**こと。
 *
 * ⚠️ **支払方法が 1 件も無い組織ではこの行ごと出さない。**「すべて / 現金」の
 *    2 択だけが並んでも意味が無く、画面が 1 行ぶん無駄に伸びる。
 */
export function MethodChips({
  methods,
  value,
  onChange,
}: {
  /** ⚠️ 現金は含めない（ここで先頭に足す） */
  methods: PaymentMethod[];
  value: string;
  onChange: (next: string) => void;
}) {
  if (methods.length === 0) return null;

  const options = [
    { key: ALL_METHODS, label: "すべて" },
    { key: CASH_METHOD_KEY, label: "現金" },
    ...methods.map((m) => ({ key: m.id, label: m.name })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      /* ⚠️ 横スクロールの中に置くので、上位の横スワイプ（ChartPager）とは
            別の階層にすること。グラフの中に入れると期間送りと競合する */
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(option.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2, paddingRight: spacing.md },
  chip: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.cyan100,
    backgroundColor: color.cardBg,
  },
  chipActive: { borderColor: color.teal, backgroundColor: color.cyan50 },
  label: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  labelActive: { fontFamily: font.uiBold, color: color.tealDeeper },
});
