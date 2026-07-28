import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { color, font, radius, shadow, spacing, STORE_COLORS } from "@/theme/tokens";

/**
 * グラフは素の View だけで描く。
 *
 * 設計図 12 章は victory-native + Skia を挙げているが、
 *   - 描くのは月次 12〜24 本と店舗別数本の棒だけで、Skia が必要な描画量ではない
 *   - Skia は web で WASM の読み込み設定が要り、ブラウザ確認が壊れる
 * ため、依存を足さずに実装している。
 * ツールチップやズームなど凝った操作が必要になった時点で Skia を再検討する。
 */

/** Web の formatAxis と同じ丸め方（億 / 万 / そのまま） */
export function formatAxisValue(value: number): string {
  if (value >= 100_000_000) return `${Math.round(value / 100_000_000)}億`;
  if (value >= 10_000) return `${Math.round(value / 10_000)}万`;
  return String(value);
}

type MonthlyPoint = { month: string; total: number; count: number };

/**
 * 月次の集金推移。直近 12 か月ぶんを右詰めで表示し、
 * 棒をタップするとその月の金額と回数を出す。
 */
export function MonthlyBarChart({ data }: { data: MonthlyPoint[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const points = data.slice(-12);
  if (points.length === 0) {
    return <Text style={styles.empty}>表示できるデータがありません</Text>;
  }

  const max = Math.max(...points.map((p) => p.total), 1);
  const active = points.find((p) => p.month === selected) ?? points[points.length - 1];

  return (
    <View>
      <View style={styles.readout}>
        <Text style={styles.readoutMonth}>{formatMonthLabel(active.month)}</Text>
        <Text style={styles.readoutValue}>¥{active.total.toLocaleString()}</Text>
        <Text style={styles.readoutCount}>{active.count}回</Text>
      </View>

      <View style={styles.plotRow}>
        <View style={styles.yAxis}>
          <Text style={styles.axisLabel}>{formatAxisValue(max)}</Text>
          <Text style={styles.axisLabel}>{formatAxisValue(Math.round(max / 2))}</Text>
          <Text style={styles.axisLabel}>0</Text>
        </View>

        <View style={styles.plot}>
          {/* 目盛り線。棒の背面に薄く引く */}
          <View style={[styles.gridLine, { top: 0 }]} />
          <View style={[styles.gridLine, { top: "50%" }]} />
          <View style={[styles.gridLine, { bottom: 0 }]} />

          <View style={styles.bars}>
            {points.map((point) => {
              const isActive = point.month === active.month;
              const heightPct = Math.max((point.total / max) * 100, point.total > 0 ? 2 : 0);
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
                      { height: `${heightPct}%`, backgroundColor: isActive ? color.teal : color.tealPale },
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

/** 積み上げ棒 1 本を構成する系列（＝店舗）。色は呼び出し側で決める */
export type StackSeries = { key: string; name: string; color: string };

/** 1 か月分。parts は series.key ごとの金額。合計は parts の総和と一致させること */
export type StackedPoint = {
  month: string;
  total: number;
  count: number;
  parts: Record<string, number>;
};

/**
 * 月別売上の積み上げ棒。
 *
 * Web の ManyCoinDataChart.jsx が `<Bar stackId="stack">` を店舗ぶん並べて
 * 1 本の棒を店舗色で積み上げている。棒をタップすると Web のツールチップと同じく
 * 店舗ごとの内訳と合計を出す。凡例も Web と同じく棒の下に置く。
 *
 * MonthlyBarChart（単色）は店舗別の内訳が取れないときの退避先として残してある。
 */
export function MonthlyStackedBarChart({
  data,
  series,
}: {
  data: StackedPoint[];
  series: StackSeries[];
}) {
  /** 吹き出しを出している月。null = 閉じている */
  const [selected, setSelected] = useState<string | null>(null);
  /** 吹き出しの左右位置を決めるのに要る。棒の中心から出して画面端で丸める */
  const [plotWidth, setPlotWidth] = useState(0);

  if (data.length === 0 || series.length === 0) {
    return <Text style={styles.empty}>表示できるデータがありません</Text>;
  }

  const max = Math.max(...data.map((p) => p.total), 1);
  const active = data.find((p) => p.month === selected) ?? data[data.length - 1];

  // 棒が細くなると全ての月にラベルを置けない。12 本を超えたら間引く
  const labelStep = Math.ceil(data.length / 12);
  // 年が変わる最初の月にだけ「YYYY年」を添える（Web の CustomXTick と同じ）
  const yearHeads = new Set<string>();
  let lastYear = "";
  for (const point of data) {
    const year = point.month.slice(0, 4);
    if (year !== lastYear) {
      yearHeads.add(point.month);
      lastYear = year;
    }
  }

  /** 吹き出しの中身。金額の多い順で、0 円の店舗は並べない */
  const tipIndex = selected === null ? -1 : data.findIndex((p) => p.month === selected);
  const tip =
    tipIndex >= 0
      ? {
          point: data[tipIndex],
          rows: series
            .map((s) => ({ ...s, value: data[tipIndex].parts[s.key] ?? 0 }))
            .filter((s) => s.value > 0)
            .sort((a, b) => b.value - a.value),
          heightPct: Math.max(
            (data[tipIndex].total / max) * 100,
            data[tipIndex].total > 0 ? 2 : 0
          ),
        }
      : null;

  return (
    <View>
      <View style={styles.readout}>
        <Text style={styles.readoutMonth}>{formatMonthLabel(active.month)}</Text>
        <Text style={styles.readoutValue}>¥{active.total.toLocaleString()}</Text>
        <Text style={styles.readoutCount}>{active.count}回</Text>
      </View>

      <View style={styles.plotRow}>
        <View style={styles.yAxis}>
          <Text style={styles.axisLabel}>{formatAxisValue(max)}</Text>
          <Text style={styles.axisLabel}>{formatAxisValue(Math.round(max / 2))}</Text>
          <Text style={styles.axisLabel}>0</Text>
        </View>

        <View
          style={styles.plot}
          onLayout={(e) => setPlotWidth(Math.round(e.nativeEvent.layout.width))}
        >
          <View style={[styles.gridLine, { top: 0 }]} />
          <View style={[styles.gridLine, { top: "50%" }]} />
          <View style={[styles.gridLine, { bottom: 0 }]} />

          <View style={styles.bars}>
            {data.map((point) => {
              const isActive = point.month === active.month;
              const heightPct = Math.max((point.total / max) * 100, point.total > 0 ? 2 : 0);
              return (
                <Pressable
                  key={point.month}
                  style={styles.barSlot}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    // 同じ棒をもう一度押したら閉じる
                    setSelected((prev) => (prev === point.month ? null : point.month));
                  }}
                >
                  {/* 高さは % なので親（barSlot）に確定した高さが要る。
                      内訳の配分は flex に任せる（% の入れ子は解決できない） */}
                  <View
                    style={[
                      styles.stack,
                      { height: `${heightPct}%`, opacity: isActive ? 1 : 0.55 },
                    ]}
                  >
                    {/* 下から series の順で積む＝描画は逆順 */}
                    {[...series].reverse().map((s) => {
                      const value = point.parts[s.key] ?? 0;
                      if (value <= 0) return null;
                      return (
                        <View
                          key={s.key}
                          style={{ flex: value, backgroundColor: s.color }}
                        />
                      );
                    })}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/*
            Web のツールチップに当たる内訳。棒の直上に浮かせる。
            ⚠️ 以前は棒の上に常時展開していたので、店舗数ぶん縦を食ってグラフが潰れていた。
               棒が高いときは上に出すと見切れるため、その場合だけ下向きに出す。
          */}
          {tip && tip.rows.length > 0 && (
            <Pressable
              onPress={() => setSelected(null)}
              style={[
                styles.tip,
                tipOffset(tipIndex, data.length, plotWidth),
                tip.heightPct > 55
                  ? { top: `${100 - tip.heightPct}%`, marginTop: 6 }
                  : { bottom: `${tip.heightPct}%`, marginBottom: 6 },
              ]}
            >
              <View style={styles.tipHead}>
                <Text style={styles.tipMonth}>{formatMonthLabel(tip.point.month)}</Text>
                <Text style={styles.tipTotal}>¥{tip.point.total.toLocaleString()}</Text>
              </View>
              {tip.rows.map((item) => (
                <View key={item.key} style={styles.breakdownRow}>
                  <View style={[styles.swatch, { backgroundColor: item.color }]} />
                  <Text style={styles.breakdownName} numberOfLines={1}>
                    {item.name}店
                  </Text>
                  <Text style={styles.breakdownValue}>¥{item.value.toLocaleString()}</Text>
                </View>
              ))}
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.xAxis}>
        {data.map((point, i) => (
          <View key={point.month} style={styles.xSlot}>
            {/* 年の行は常に出す。年頭の列だけ 2 行になると月の数字の高さが揃わない */}
            <Text style={styles.xYear} numberOfLines={1}>
              {yearHeads.has(point.month) ? `${point.month.slice(2, 4)}年` : " "}
            </Text>
            <Text style={styles.xMonth} numberOfLines={1}>
              {i % labelStep === 0 ? Number(point.month.slice(5)) : " "}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.axisCaption}>月</Text>

      {/* 凡例。Web も棒の下に色見本と店舗名を並べている */}
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {s.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** 吹き出しの横幅。中身の文字数で伸び縮みさせると端の丸め計算ができない */
const TIP_WIDTH = 168;

/**
 * 吹き出しの左端。押した棒の中心に合わせつつ、グラフの外へはみ出さないよう丸める。
 * 幅がまだ測れていないうちは中央に置いておく。
 */
function tipOffset(index: number, count: number, plotWidth: number) {
  if (plotWidth <= 0) return { left: 0 };
  const center = ((index + 0.5) / count) * plotWidth;
  const left = Math.min(Math.max(center - TIP_WIDTH / 2, 0), Math.max(0, plotWidth - TIP_WIDTH));
  return { left };
}

type StorePoint = { laundryId: string; laundryName: string; total: number };

/**
 * 店舗別の累計売上。ランキングなので横棒にする。
 * 配色は Web の StoreRevenueChart と同じ 10 色パレットを順に当てる。
 */
export function StoreRankBars({ data }: { data: StorePoint[] }) {
  if (data.length === 0) {
    return <Text style={styles.empty}>表示できるデータがありません</Text>;
  }

  const max = Math.max(...data.map((d) => d.total), 1);

  return (
    <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
      {data.map((store, i) => (
        <View key={store.laundryId} style={styles.rankRow}>
          <View style={styles.rankHead}>
            <Text style={styles.rankName} numberOfLines={1}>
              {store.laundryName}店
            </Text>
            <Text style={styles.rankValue}>¥{store.total.toLocaleString()}</Text>
          </View>
          <View style={styles.rankTrack}>
            <View
              style={[
                styles.rankFill,
                {
                  width: `${Math.max((store.total / max) * 100, store.total > 0 ? 2 : 0)}%`,
                  backgroundColor: STORE_COLORS[i % STORE_COLORS.length],
                },
              ]}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

const CHART_HEIGHT = 160;

const styles = StyleSheet.create({
  empty: { fontFamily: font.ui, fontSize: 13, color: color.textMuted, textAlign: "center", paddingVertical: spacing.xl },
  readout: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginBottom: spacing.md },
  readoutMonth: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  readoutValue: { fontFamily: font.mono, fontSize: 20, color: color.tealDeeper },
  readoutCount: { fontFamily: font.ui, fontSize: 12, color: color.textFaint },
  plotRow: { flexDirection: "row", height: CHART_HEIGHT },
  yAxis: { width: 34, justifyContent: "space-between", paddingRight: spacing.xs },
  axisLabel: { fontFamily: font.ui, fontSize: 9, color: color.textFaint, textAlign: "right" },
  plot: { flex: 1, position: "relative" },
  gridLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: color.divider },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  barSlot: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  xAxis: { flexDirection: "row", gap: 3, marginTop: spacing.xs, paddingLeft: 34 },
  xLabel: { flex: 1, fontFamily: font.ui, fontSize: 9, color: color.textFaint, textAlign: "center" },
  axisCaption: { fontFamily: font.ui, fontSize: 9, color: color.textFaint, textAlign: "right", marginTop: 2 },
  // ── 積み上げ棒 ──
  stack: { width: "100%", borderTopLeftRadius: 3, borderTopRightRadius: 3, overflow: "hidden", minHeight: 2 },
  xSlot: { flex: 1, alignItems: "center" },
  xYear: { fontFamily: font.ui, fontSize: 8, color: color.textFaint, lineHeight: 10 },
  xMonth: { fontFamily: font.ui, fontSize: 9, color: color.textFaint, lineHeight: 12 },
  /* 棒の上に浮かせる吹き出し。棒より手前に出すため zIndex / elevation を上げる */
  tip: {
    position: "absolute",
    width: TIP_WIDTH,
    backgroundColor: color.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.cyan200,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
    zIndex: 10,
    ...shadow.sm,
  },
  tipHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
    paddingBottom: 4,
    marginBottom: 2,
  },
  tipMonth: { fontFamily: font.ui, fontSize: 10, color: color.textMuted },
  tipTotal: { fontFamily: font.mono, fontSize: 13, color: color.tealDeeper },
  breakdownRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  breakdownName: { flex: 1, fontFamily: font.ui, fontSize: 11, color: color.textMuted },
  breakdownValue: { fontFamily: font.mono, fontSize: 11, color: color.textMain },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: 120 },
  legendLabel: { fontFamily: font.ui, fontSize: 10, color: color.textMuted, flexShrink: 1 },
  rankRow: { marginBottom: spacing.md },
  rankHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  rankName: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain, flex: 1 },
  rankValue: { fontFamily: font.mono, fontSize: 13, color: color.tealDeeper },
  rankTrack: { height: 10, backgroundColor: color.divider, borderRadius: radius.pill, overflow: "hidden" },
  rankFill: { height: "100%", borderRadius: radius.pill },
});
