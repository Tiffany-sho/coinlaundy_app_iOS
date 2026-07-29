import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/common/ui";
import { color, font, spacing, numeric } from "@/theme/tokens";
import type { MonthlyPoint } from "@/api/types";

/**
 * 前月比・前年同月比。Web の MonthlySummaryCard.jsx と同じ 4 列の表。
 *
 * 収益タブ（組織全体）と店舗別の集金履歴の両方で出すので切り出してある。
 * データは useMonthlySummary(storeId) の戻り値をそのまま渡す。storeId の有無だけが違い、
 * 計算は同じ（Web も storeId を渡し分けて同じカードを使い回している）。
 */
export function MonthlySummaryTable({ data }: { data: MonthlyPoint[] }) {
  const rows = useMemo(() => {
    const byMonth = new Map(data.map((d) => [d.month, d.total]));
    return data
      .slice(-6)
      .reverse()
      .map((point) => {
        const [y, m] = point.month.split("-").map(Number);
        const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
        const prevYear = `${y - 1}-${String(m).padStart(2, "0")}`;
        return {
          label: `${y}年${m}月`,
          total: point.total,
          momRate: rate(point.total, byMonth.get(prevMonth)),
          yoyRate: rate(point.total, byMonth.get(prevYear)),
        };
      });
  }, [data]);

  if (rows.length === 0) return null;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={styles.cardTitle}>月次サマリー</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, { flex: 1.4 }]}>月</Text>
        <Text style={[styles.th, styles.right]}>売上</Text>
        <Text style={[styles.th, styles.right]}>前月比</Text>
        <Text style={[styles.th, styles.right]}>前年同月比</Text>
      </View>
      {rows.map((row, i) => (
        <View key={row.label} style={[styles.tr, i % 2 === 1 && { backgroundColor: "#F8FAFC" }]}>
          <Text style={[styles.td, { flex: 1.4 }]}>{row.label}</Text>
          <Text style={[styles.td, styles.right, styles.num]}>{row.total.toLocaleString()}</Text>
          <RateCell value={row.momRate} />
          <RateCell value={row.yoyRate} />
        </View>
      ))}
    </Card>
  );
}

function RateCell({ value }: { value: number | null }) {
  if (value === null) {
    return <Text style={[styles.td, styles.right, { color: color.textFaint }]}>—</Text>;
  }
  const positive = value >= 0;
  return (
    <Text
      style={[styles.td, styles.right, styles.num, { color: positive ? "#059669" : color.red500 }]}
    >
      {positive ? "+" : ""}
      {value.toFixed(1)}%
    </Text>
  );
}

/** 前月・前年同月がない、または 0 円だった月は比較できないので null */
function rate(current: number, previous?: number): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

const styles = StyleSheet.create({
  cardTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper, marginBottom: spacing.md },
  tableHead: {
    flexDirection: "row",
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  th: { flex: 1, fontFamily: font.uiBold, fontSize: 11, color: color.textMuted },
  tr: { flexDirection: "row", paddingVertical: spacing.sm, alignItems: "center" },
  td: { flex: 1, fontFamily: font.ui, fontSize: 12, color: color.textMain },
  right: { textAlign: "right" },
  num: { ...numeric },
});
