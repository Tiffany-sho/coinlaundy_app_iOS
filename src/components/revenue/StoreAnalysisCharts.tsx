import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { formatAxisValue } from "@/components/revenue/charts";
import { jstWeekday } from "@/shared/date";
import { fundAmount } from "@/components/revenue/historyRows";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { FundListItem, MonthlyPoint } from "@/api/types";

/**
 * 店舗 1 軒を見るときの分析グラフ。
 *
 * 組織全体の収益タブは「どの店舗が稼いでいるか」を見る画面なので店舗別の棒が主役だが、
 * 店舗が 1 軒に固定されるとその軸が消える。代わりに**その店舗の中の傾向**を出す。
 *
 * ⚠️ 依存は足していない。`charts.tsx` と同じく素の View だけで描く
 *    （理由は charts.tsx 冒頭のコメント）。
 */

/* ------------------------------------------------------------------ */
/* 1 回あたり平均の推移                                                 */
/* ------------------------------------------------------------------ */

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
export function AveragePerCollectChart({ data }: { data: MonthlyPoint[] }) {
  const points = useMemo(
    () =>
      data
        .slice(-12)
        .map((p) => ({
          month: p.month,
          total: p.total,
          count: p.count,
          // ⚠️ 0 除算。集金が 1 件も無い月は summary に載らないはずだが、
          //    載ってきても NaN を描かないようにする
          average: p.count > 0 ? Math.round(p.total / p.count) : 0,
        }))
        .filter((p) => p.count > 0),
    [data]
  );

  const [selected, setSelected] = useState<string | null>(null);

  if (points.length === 0) {
    return <Text style={styles.empty}>表示できるデータがありません</Text>;
  }

  const max = Math.max(...points.map((p) => p.average), 1);
  const active = points.find((p) => p.month === selected) ?? points[points.length - 1];

  return (
    <View>
      <View style={styles.readout}>
        <Text style={styles.readoutLabel}>{formatMonthLabel(active.month)}</Text>
        <Text style={styles.readoutValue}>¥{active.average.toLocaleString()}</Text>
        <Text style={styles.readoutSub}>
          {active.count}回 / 合計 ¥{active.total.toLocaleString()}
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

          <View style={styles.bars}>
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

      <View style={styles.xAxis}>
        {points.map((point) => (
          <Text key={point.month} style={styles.xLabel} numberOfLines={1}>
            {Number(point.month.slice(5))}
          </Text>
        ))}
      </View>
      <Text style={styles.axisCaption}>月</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 曜日別の売上                                                        */
/* ------------------------------------------------------------------ */

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * 曜日ごとの 1 回あたり平均集金額。
 *
 * 「いつ回るのが効率的か」を決めるための材料。合計で見ると
 * **その曜日に何回行ったかに引きずられる**ので、平均を主に出して合計は添える。
 *
 * ⚠️ 曜日は `jstWeekday()` で数える。`new Date(epochMs).getDay()` は端末 TZ 基準で、
 *    端末が JST より西だと前日の曜日になる（`collect_funds.date` は JST 深夜 0 時の epoch）。
 *
 * ⚠️ 渡すのは**全期間**の集金。期間を絞ると「土曜が強い」という結論が
 *    その期間の偏りだけで決まる。
 */
export function WeekdayRevenueChart({ items }: { items: FundListItem[] }) {
  const buckets = useMemo(() => {
    const out = WEEKDAY_LABELS.map((label, index) => ({
      index,
      label,
      total: 0,
      count: 0,
      average: 0,
    }));
    for (const item of items) {
      const bucket = out[jstWeekday(item.date)];
      bucket.total += fundAmount(item);
      bucket.count += 1;
    }
    for (const bucket of out) {
      bucket.average = bucket.count > 0 ? Math.round(bucket.total / bucket.count) : 0;
    }
    return out;
  }, [items]);

  const [selected, setSelected] = useState<number | null>(null);

  const withData = buckets.filter((b) => b.count > 0);
  if (withData.length === 0) {
    return <Text style={styles.empty}>表示できるデータがありません</Text>;
  }

  const max = Math.max(...buckets.map((b) => b.average), 1);
  // 既定は「平均が一番高い曜日」。何も選んでいないときに見たい情報がこれ
  const best = withData.reduce((a, b) => (b.average > a.average ? b : a));
  const active = selected !== null ? buckets[selected] : best;

  return (
    <View>
      <View style={styles.readout}>
        <Text style={styles.readoutLabel}>{active.label}曜日</Text>
        <Text style={styles.readoutValue}>
          {active.count > 0 ? `¥${active.average.toLocaleString()}` : "—"}
        </Text>
        <Text style={styles.readoutSub}>
          {active.count > 0
            ? `1回あたり・${active.count}回 / 合計 ¥${active.total.toLocaleString()}`
            : "この曜日の集金はありません"}
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

          <View style={styles.bars}>
            {buckets.map((bucket) => {
              const isActive = bucket.index === active.index;
              const heightPct = Math.max((bucket.average / max) * 100, bucket.average > 0 ? 2 : 0);
              return (
                <Pressable
                  key={bucket.index}
                  style={styles.barSlot}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelected(bucket.index);
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

      <View style={styles.xAxis}>
        {buckets.map((bucket) => (
          <Text
            key={bucket.index}
            style={[styles.xLabel, bucket.index === active.index && styles.xLabelActive]}
          >
            {bucket.label}
          </Text>
        ))}
      </View>
      <Text style={styles.axisCaption}>1回あたりの平均</Text>
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
  xLabelActive: { fontFamily: font.uiBold, color: color.teal },
  axisCaption: {
    fontFamily: font.ui,
    fontSize: 10,
    color: color.textFaint,
    textAlign: "right",
    marginTop: 2,
  },
});
