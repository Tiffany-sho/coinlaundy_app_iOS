import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { barGap, formatAxisValue, MonthAxis } from "@/components/revenue/charts";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { AveragePoint } from "@/components/revenue/monthlySeries";

/**
 * 店舗 1 軒を見るときの分析グラフ。
 *
 * 組織全体の収益タブは「どの店舗が稼いでいるか」を見る画面なので店舗別の棒が主役だが、
 * 店舗が 1 軒に固定されるとその軸が消える。代わりに**その店舗の中の傾向**を出す。
 *
 * ⚠️ 依存は足していない。`charts.tsx` と同じく素の View だけで描く
 *    （理由は charts.tsx 冒頭のコメント）。
 */

/**
 * 月ごとの「1 回あたり平均集金額」。
 *
 * 集金の回数を増やせば総額は当然増えるので、総額だけ見ていると
 * 「機械の稼ぎが落ちているのに回数で補っている」状態に気づけない。
 * 1 回あたりに直すと台の稼ぎそのものの傾向が出る。
 *
 * ⚠️ **割るのは `count`（集金回数）。`storeCount` で割らない。**
 *    ホームの「1回あたり平均」と同じ式にしてある（本家 `SalesCardClient.jsx` の
 *    `FundsDisplay`）。`storeCount` は「何店舗を回ったか」で、店舗別のこの画面では
 *    常に 1 なので割ると総額と同じ数字になってしまう。
 */
export function AveragePerCollectChart({ points }: { points: AveragePoint[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  if (points.length === 0) {
    return <Text style={styles.empty}>表示できるデータがありません</Text>;
  }

  const max = Math.max(...points.map((p) => p.average), 1);
  const active = points.find((p) => p.month === selected) ?? points[points.length - 1];
  /* ⚠️ 棒と x 軸で同じ値を使う。MonthAxis も barGap() を呼ぶので必ず一致する */
  const gap = barGap(points.length);

  return (
    <View>
      <View style={styles.readout}>
        <Text style={styles.readoutLabel}>{formatMonthLabel(active.month)}</Text>
        {/* ⚠️ 集金が無い月は 0 円と書かない。「平均 0 円」と読めてしまう */}
        <Text style={styles.readoutValue}>
          {active.count > 0 ? `¥${active.average.toLocaleString()}` : "—"}
        </Text>
        <Text style={styles.readoutSub}>
          {active.count > 0
            ? `${active.count}回 / 合計 ¥${active.total.toLocaleString()}`
            : "この月の集金記録はありません"}
        </Text>
      </View>

      <View style={styles.plotRow}>
        <View style={styles.yAxis}>
          <Text style={styles.axisLabel}>{formatAxisValue(max)}</Text>
          <Text style={styles.axisLabel}>{formatAxisValue(Math.round(max / 2))}</Text>
          <Text style={styles.axisLabel}>0</Text>
        </View>

        <View style={styles.plot}>
          <View style={[styles.gridLine, { top: 0 }]} />
          <View style={[styles.gridLine, { top: "50%" }]} />
          <View style={[styles.gridLine, { bottom: 0 }]} />

          <View style={[styles.bars, { gap }]}>
            {points.map((point) => {
              const isActive = point.month === active.month;
              const heightPct = Math.max(
                (point.average / max) * 100,
                point.average > 0 ? 2 : 0
              );
              return (
                <Pressable
                  key={point.month}
                  style={styles.barSlot}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelected(point.month);
                  }}
                >
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${heightPct}%`,
                        backgroundColor: isActive ? color.teal : color.tealPale,
                      },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* ⚠️ 月別売上と同じ軸を使う。自前で並べると長い期間でラベルが切り詰められる */}
      <MonthAxis months={points.map((p) => p.month)} />
    </View>
  );
}

/** "2026-07" → "2026年7月" */
function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

/* charts.tsx と同じ見た目に揃える。あちらの styles は非公開なので必要な分だけ持つ */
const styles = StyleSheet.create({
  empty: {
    fontFamily: font.ui,
    fontSize: 13,
    color: color.textFaint,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  readout: { marginBottom: spacing.md },
  readoutLabel: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  readoutValue: {
    ...numeric,
    fontSize: 24,
    color: color.tealDeeper,
    marginTop: 2,
  },
  readoutSub: { fontFamily: font.ui, fontSize: 12, color: color.textFaint, marginTop: 2 },
  plotRow: { flexDirection: "row", height: 148 },
  yAxis: { width: 34, justifyContent: "space-between", alignItems: "flex-end", paddingRight: 6 },
  axisLabel: { ...numeric, fontSize: 10, color: color.textFaint },
  plot: { flex: 1, position: "relative" },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: color.divider,
  },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end" },
  barSlot: { flex: 1, height: "100%", justifyContent: "flex-end", paddingHorizontal: 2 },
  bar: { width: "100%", borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  xAxis: { flexDirection: "row", marginLeft: 34, marginTop: spacing.xs },
  xLabel: {
    flex: 1,
    textAlign: "center",
    fontFamily: font.ui,
    fontSize: 10,
    color: color.textFaint,
  },
  axisCaption: {
    fontFamily: font.ui,
    fontSize: 10,
    color: color.textFaint,
    textAlign: "right",
    marginTop: 2,
  },
});
