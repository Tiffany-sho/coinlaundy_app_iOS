import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, MoneyText } from "@/components/common/ui";
import { CASH_METHOD_KEY } from "@/api/types";
import { methodBreakdown } from "@/components/revenue/methodFilter";
import { collecterName, type HistoryRow } from "@/components/revenue/historyRows";
import { formatJstDate } from "@/shared/date";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { FundListItem } from "@/api/types";

/** 売上履歴の行。組み立ては historyRows.ts、ここは見た目だけ */

/** 月の見出し。Web の CoinManyDataTable と同じく件数と合計を並べ、タップで畳める */
export function MonthHeaderRow({
  row,
  onPress,
}: {
  row: Extract<HistoryRow, { kind: "month" }>;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <View style={styles.monthHeader}>
        <View style={styles.monthIcon}>
          <Ionicons name="calendar" size={16} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.monthLabel}>{row.label}</Text>
          <Text style={styles.monthCount}>{row.count}件</Text>
        </View>
        <MoneyText value={row.total} size={17} tone="deeper" />
        <Ionicons
          name={row.collapsed ? "chevron-down" : "chevron-up"}
          size={16}
          color={color.teal}
          style={{ marginLeft: spacing.sm }}
        />
      </View>
    </Pressable>
  );
}

/** 履歴の 1 件。タップで集金の詳細（機種ごとの金額・日付・削除）へ */
export function FundRow({ item, onPress }: { item: FundListItem; onPress: () => void }) {
  /*
    支払方法の内訳。
    ⚠️ **現金だけの集金では出さない。** 「現金 ¥3,000」と総額が同じ数字で
       2 回並ぶだけになる。現金以外が 1 つでもあるときだけ出す。
    ⚠️ 内訳を出すのは、**絞り込んでも行の金額が総額のまま**だから
       （`matchesMethods` は「含む」で判定する）。数字の根拠を必ず添える。
  */
  const breakdown = methodBreakdown(item);
  const showBreakdown = breakdown.some((row) => row.key !== CASH_METHOD_KEY);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.storeName}>{item.laundryName}店</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{formatJstDate(item.date)}</Text>
              <Text style={styles.metaFaint}>{collecterName(item)}</Text>
            </View>
          </View>
          <MoneyText value={item.totalFunds} size={16} tone="deeper" />
          <Ionicons
            name="chevron-forward"
            size={16}
            color={color.cyan300}
            style={{ marginLeft: spacing.sm }}
          />
        </View>

        {showBreakdown && (
          <View style={styles.methodRow}>
            {breakdown.map((row) => (
              <View key={row.key} style={styles.methodTag}>
                <Text style={styles.methodName} numberOfLines={1}>
                  {row.label}
                </Text>
                <Text style={styles.methodAmount}>¥{row.amount.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

/**
 * 「さらに表示」。手元にある全期間ぶんのデータを、押すたびに追加で出す。
 *
 * ⚠️ 取得範囲を変えるボタンではない。データは最初から全期間ぶん来ていて、
 *    並び替えもその全部に対して済んでいる。ここは表示量だけを増やす。
 *    残りの件数／月数を必ず出すこと（あとどれだけあるか分からないと押す気にならない）。
 */
export function ShowMoreRow({
  remaining,
  unit,
  loading,
  onPress,
}: {
  /** まだ出していない月数（日付順）か件数（売上順） */
  remaining: number;
  unit: "month" | "row";
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      style={({ pressed }) => [styles.showMore, pressed && !loading && { opacity: 0.8 }]}
    >
      {loading ? (
        <ActivityIndicator color={color.teal} />
      ) : (
        <>
          <Ionicons name="chevron-down" size={16} color={color.teal} />
          <Text style={styles.showMoreLabel}>
            さらに表示（残り{remaining}
            {unit === "month" ? "か月" : "件"}）
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * 出し切ったときの締め。
 * ⚠️ ここを消さないこと。何も出さないと「さらに表示が消えた／出ない」の区別が付かない。
 */
export function ListEndRow({ fundCount }: { fundCount: number }) {
  return (
    <View style={styles.end}>
      <Ionicons name="checkmark-circle-outline" size={15} color={color.textFaint} />
      <Text style={styles.endLabel}>すべて表示しました（{fundCount}件）</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* 支払方法の内訳。⚠️ 折り返す（方法が増えると横に収まらない） */
  methodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  methodTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: color.gray50,
  },
  methodName: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, flexShrink: 1 },
  /* ⚠️ numeric を丸ごと展開する。fontFamily だけだと桁が揃わない */
  methodAmount: { ...numeric, fontSize: 11, color: color.tealDeeper },
  row: { flexDirection: "row", alignItems: "center" },
  storeName: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  metaRow: { flexDirection: "row", gap: spacing.sm, marginTop: 2 },
  meta: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  metaFaint: { fontFamily: font.ui, fontSize: 12, color: color.textFaint },

  /* 月の区切り。明細カードと同じ幅・同じ角丸だと境目が分からないので、
     左右にはみ出させた帯にして、上に間を空けて前の月と切り離す */
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: color.cyan100,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.cyan200,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  monthIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: color.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
  monthCount: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 1 },

  showMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.cyan200,
    backgroundColor: color.cardBg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  showMoreLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
  end: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  endLabel: { fontFamily: font.ui, fontSize: 12, color: color.textFaint },
});
