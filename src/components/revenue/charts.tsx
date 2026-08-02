import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { color, font, radius, spacing, STORE_COLORS, numeric } from "@/theme/tokens";

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
 * 1 本の棒を店舗色で積み上げている。棒をタップすると、その月の店舗別内訳を
 * **グラフの下**に一覧で出す。
 *
 * ⚠️ 内訳を棒の直上に浮かせる吹き出しにしない。棒が細いと吹き出しが指で隠れ、
 *    端の月では位置を丸める必要があり、行数が増えるとグラフに被る。
 *    下に置けば店舗が何店あっても縦に伸ばせるし、指の下に入らない。
 *    凡例は内訳一覧が色見本を兼ねるので別に置かない（同じ行が 2 回並ぶだけ）。
 *
 * ⚠️ **内訳は既定でたたんでおく。** 店舗数ぶん行が伸びるので、開きっぱなしだと
 *    カードが縦に長くなって下の売上履歴が遠ざかる。開く操作は 2 つある
 *    （棒を押す / 見出しの開閉ボタン）が、閉じる操作も必ず残すこと。
 *    棒しか押せないと、開いたあと閉じる手段が無くなる。
 *
 * MonthlyBarChart（単色）は店舗別の内訳が取れないときの退避先として残してある。
 */
export function MonthlyStackedBarChart({
  data,
  series,
  showBreakdown = true,
  breakdownTitle = "店舗別",
}: {
  data: StackedPoint[];
  series: StackSeries[];
  /**
   * 店舗別の内訳を下に出すか。
   * ⚠️ 店舗が 1 軒しか無いとき（店舗別の収益ページ）は false。
   *    棒の合計と内訳が同じ数字になり、色見本としての役割も無いので同じ行が 2 回並ぶだけになる。
   */
  showBreakdown?: boolean;
  /**
   * 内訳の見出し（「◯月の<ここ>」）。積み上げの単位が店舗とは限らない。
   * ⚠️ **支払方法で絞ると系列は支払方法になる。** 「店舗別」のままだと
   *    見出しと中身が食い違う。
   */
  breakdownTitle?: string;
}) {
  /** 内訳を出している月。null = まだ押していない（＝最新月） */
  const [selected, setSelected] = useState<string | null>(null);
  /** 内訳を開いているか。⚠️ 既定は閉じる（カードを短く保つため） */
  const [expanded, setExpanded] = useState(false);

  if (data.length === 0 || series.length === 0) {
    return <Text style={styles.empty}>表示できるデータがありません</Text>;
  }

  const max = Math.max(...data.map((p) => p.total), 1);
  const active = data.find((p) => p.month === selected) ?? data[data.length - 1];

  /** 一覧の中身。金額の多い順。0 円の店舗も色見本として末尾に残す（凡例を兼ねるため） */
  const rows = series
    .map((s) => ({ ...s, value: active.parts[s.key] ?? 0 }))
    .sort((a, b) => b.value - a.value);

  /* ⚠️ 棒と x 軸で同じ値を使う。MonthAxis も barGap() を呼ぶので必ず一致する */
  const gap = barGap(data.length);

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
          <View style={[styles.gridLine, { top: 0 }]} />
          <View style={[styles.gridLine, { top: "50%" }]} />
          <View style={[styles.gridLine, { bottom: 0 }]} />

          <View style={[styles.bars, { gap }]}>
            {data.map((point) => {
              const isActive = point.month === active.month;
              const heightPct = Math.max((point.total / max) * 100, point.total > 0 ? 2 : 0);
              return (
                <Pressable
                  key={point.month}
                  style={styles.barSlot}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatMonthLabel(point.month)}の内訳を見る`}
                  accessibilityState={{ selected: isActive }}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    /* 開いている月をもう一度押したら閉じる。
                       ⚠️ 指を動かさずに閉じられる経路を残しておくこと。
                          棒が「開く専用」だと、閉じるのに見出しまで戻る必要が出る */
                    if (showBreakdown && expanded && point.month === active.month) {
                      setExpanded(false);
                      return;
                    }
                    setSelected(point.month);
                    if (showBreakdown) setExpanded(true);
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
        </View>
      </View>

      <MonthAxis months={data.map((p) => p.month)} />

      {/*
        店舗別の内訳。押した棒に追従する（既定は一番右＝最新月）。
        凡例を兼ねるので、その月に売上が無い店舗も色見本として ¥0 で残す。

        ⚠️ **ここに月の合計を出さない。** すぐ上の readout が同じ月の同じ金額を
           出しているので、同じ数字が縦に 2 回並ぶ。見出しは月と「店舗別」だけ。

        ⚠️ 見出しの行は**たたんでいるときも必ず出す。** これが唯一の
           「棒を押さずに開く」入口で、消すと閉じた状態から開けなくなる。
      */}
      {showBreakdown && (
        <View style={styles.breakdown}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setExpanded((prev) => !prev);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${formatMonthLabel(active.month)}の${breakdownTitle}内訳を${expanded ? "閉じる" : "開く"}`}
            accessibilityState={{ expanded }}
            hitSlop={6}
            style={({ pressed }) => [styles.breakdownHead, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.breakdownTitle} numberOfLines={1}>
              {formatMonthLabel(active.month)}の{breakdownTitle}
            </Text>
            <Text style={styles.breakdownToggle}>{expanded ? "閉じる" : "内訳を見る"}</Text>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={15}
              color={color.teal}
            />
          </Pressable>

          {expanded &&
            (active.total === 0 ? (
              <Text style={styles.breakdownEmpty}>この月の集金記録はありません</Text>
            ) : (
              rows.map((item) => {
                const share = Math.round((item.value / active.total) * 100);
                return (
                  <View key={item.key} style={styles.breakdownRow}>
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: item.color, opacity: item.value > 0 ? 1 : 0.35 },
                      ]}
                    />
                    <Text
                      style={[styles.breakdownName, item.value === 0 && styles.breakdownDim]}
                      numberOfLines={1}
                    >
                      {/* ⚠️ ここで「店」を足さない。系列は店舗とは限らない
                             （支払方法で絞ると「PayPay店」になる）。
                             表示名は呼び出し側が完成させて渡すこと */}
                      {item.name}
                    </Text>
                    <Text style={styles.breakdownShare}>{item.value > 0 ? `${share}%` : ""}</Text>
                    <Text style={[styles.breakdownValue, item.value === 0 && styles.breakdownDim]}>
                      ¥{item.value.toLocaleString()}
                    </Text>
                  </View>
                );
              })
            ))}

          {/* ⚠️ たたんでいる間は出さない。短くするために折りたたんでいるのに、
                 案内で 1 行増やしては意味が無い（開き方は「内訳を見る」が示している） */}
          {expanded && data.length > 1 && (
            <Text style={styles.breakdownHint}>棒を押すと、その月の内訳に切り替わります</Text>
          )}
        </View>
      )}
    </View>
  );
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

/**
 * 月の x 軸。**棒グラフと必ずこれを組で使う**（間隔が `barGap()` で揃うため）。
 *
 * ⚠️ **スロットの中に普通に置かない。** 5 年ぶん（60 本）だとスロットの幅が数 px しかなく、
 *    `numberOfLines={1}` の Text がその幅に切り詰められて「25年」も月の数字も読めなくなる。
 *    絶対配置で左右へはみ出させ、間引いた隣の列の上へ文字を逃がす。
 */
export function MonthAxis({ months }: { months: string[] }) {
  // 年が変わる最初の月にだけ「YYYY年」を添える（Web の CustomXTick と同じ）
  const yearHeads = new Set<string>();
  let lastYear = "";
  for (const month of months) {
    const year = month.slice(0, 4);
    if (year !== lastYear) {
      yearHeads.add(month);
      lastYear = year;
    }
  }
  const labels = pickMonthLabels(months, yearHeads);

  return (
    <>
      <View style={[styles.xAxis, { gap: barGap(months.length) }]}>
        {months.map((month) => (
          <View key={month} style={styles.xSlot}>
            {labels.has(month) && (
              <View style={styles.xLabelBox} pointerEvents="none">
                {/* 年頭以外も空行を置く。省くと月の数字の高さが列ごとに揃わない */}
                <Text style={styles.xYear} numberOfLines={1}>
                  {yearHeads.has(month) ? `${month.slice(2, 4)}年` : " "}
                </Text>
                <Text style={styles.xMonth} numberOfLines={1}>
                  {Number(month.slice(5))}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>
      <Text style={styles.axisCaption}>月</Text>
    </>
  );
}

/**
 * x 軸に月を出す間隔（1 = 毎月）。**1 月を必ず含む刻み**にしてあるので、
 * 年頭とラベルの位置が揃う。
 *
 * ⚠️ 期間は最大 5 年（60 か月）まで選べる。刻まずに全部出すと、棒が 2px まで
 *    細くなった上に隣のラベルと重なって読めない。
 * ⚠️ 画面幅ではなく本数で決めている。カードの幅は端末幅でほぼ決まるので、
 *    onLayout で測るより挙動が予測しやすい。**幅を大きく変えたらここも見直すこと。**
 * ⚠️ どの刻みでもラベルは 13 個までに収まる。増やすと隣とぶつかる。
 */
function monthLabelStep(count: number): number {
  if (count <= 12) return 1; // 毎月
  if (count <= 24) return 2; // 2 か月おき
  if (count <= 36) return 3; // 四半期（1 / 4 / 7 / 10 月）
  if (count <= 72) return 6; // 半年（1 / 7 月）
  return 12; // 年 1 回（1 月だけ）
}

/**
 * 棒どうしの間隔。**本数に追従させないと長い期間で棒が消える。**
 *
 * ⚠️ 使える幅は iPhone で **295px しかない**（画面 393 − 一覧の余白 32 −
 *    カードの余白 32 − y 軸 34）。10 年 = 120 本を `gap: 3` のまま並べると
 *    **隙間だけで 357px 必要になり、棒の幅が 0 になる。**
 * ⚠️ **x 軸のラベルの gap と必ず同じ値にすること。** 片方だけ変えると
 *    ラベルが棒の真下からじわじわずれる（本数が多いほど開く）。
 */
export function barGap(count: number): number {
  if (count <= 24) return 3;
  if (count <= 48) return 2;
  if (count <= 72) return 1;
  return 0;
}

/**
 * x 軸に月を出す列を決める。
 *
 * ⚠️ **年頭（その年の最初の月）は必ず入れる。** 年の行と月の行が別の列に出ると、
 *    どの月から新しい年なのかが読めなくなる。
 * ⚠️ **同時に隣り合わないことも保証する。** 年頭は刻みに乗っているとは限らないので、
 *    素直に足すと「24年8」と「9」が 1 列違いで並んで文字がぶつかる
 *    （期間の先頭が 1 月以外のときに必ず起きる）。近すぎるときは**年頭を優先して
 *    直前のほうを落とす。**
 */
function pickMonthLabels(months: string[], yearHeads: Set<string>): Set<string> {
  const step = monthLabelStep(months.length);
  const picked: number[] = [];

  months.forEach((month, i) => {
    const isHead = yearHeads.has(month);
    if (!isHead && (Number(month.slice(5)) - 1) % step !== 0) return;

    const prev = picked[picked.length - 1];
    if (prev !== undefined && i - prev < step) {
      if (!isHead) return; // 年頭でないほうを捨てる
      picked.pop(); // 年頭を残すため直前を落とす
    }
    picked.push(i);
  });

  return new Set(picked.map((i) => months[i]!));
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

const CHART_HEIGHT = 160;

/** x 軸のラベル 2 行分（年 10 + 月 12）。⚠️ lineHeight を変えたら合わせること */
const X_LABEL_HEIGHT = 22;

/** ラベルが左右へはみ出してよい幅。「25年」が切れない程度に取る */
const X_LABEL_BLEED = 14;

const styles = StyleSheet.create({
  empty: { fontFamily: font.ui, fontSize: 13, color: color.textMuted, textAlign: "center", paddingVertical: spacing.xl },
  readout: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginBottom: spacing.md },
  readoutMonth: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  readoutValue: { ...numeric, fontSize: 20, color: color.tealDeeper },
  readoutCount: { fontFamily: font.ui, fontSize: 12, color: color.textFaint },
  plotRow: { flexDirection: "row", height: CHART_HEIGHT },
  yAxis: { width: 34, justifyContent: "space-between", paddingRight: spacing.xs },
  axisLabel: { fontFamily: font.ui, fontSize: 9, color: color.textFaint, textAlign: "right" },
  plot: { flex: 1, position: "relative" },
  gridLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: color.divider },
  /* ⚠️ gap は barGap() で上書きする。ここの 3 は 24 本以下のときの値 */
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  barSlot: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  xAxis: { flexDirection: "row", gap: 3, marginTop: spacing.xs, paddingLeft: 34 },
  xLabel: { flex: 1, fontFamily: font.ui, fontSize: 9, color: color.textFaint, textAlign: "center" },
  axisCaption: { fontFamily: font.ui, fontSize: 9, color: color.textFaint, textAlign: "right", marginTop: 2 },
  // ── 積み上げ棒 ──
  stack: { width: "100%", borderTopLeftRadius: 3, borderTopRightRadius: 3, overflow: "hidden", minHeight: 2 },
  /* ⚠️ ラベルを絶対配置にしたので、行の高さはここで確保する（中身が無い列があるため） */
  xSlot: { flex: 1, height: X_LABEL_HEIGHT },
  /* ⚠️ 左右へはみ出させて切り詰めを防ぐ。間引いてあるので隣の文字とはぶつからない。
        ⚠️ 上の xLabel（折れ線グラフ用）とは別物。名前を寄せないこと */
  xLabelBox: {
    position: "absolute",
    top: 0,
    left: -X_LABEL_BLEED,
    right: -X_LABEL_BLEED,
    alignItems: "center",
  },
  xYear: { fontFamily: font.ui, fontSize: 8, color: color.textFaint, lineHeight: 10 },
  xMonth: { fontFamily: font.ui, fontSize: 9, color: color.textFaint, lineHeight: 12 },
  /* グラフの下に置く店舗別の内訳。凡例も兼ねる */
  breakdown: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: color.divider,
    gap: 2,
  },
  /* 開閉ボタンを兼ねる見出し。⚠️ minHeight + hitSlop で 44pt 以上の当たりを確保する
     （文字だけだと 15px しかなく、指では押せない） */
  breakdownHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 36,
  },
  breakdownTitle: {
    flex: 1,
    fontFamily: font.uiBold,
    fontSize: 12,
    color: color.tealDeeper,
  },
  breakdownToggle: { fontFamily: font.uiBold, fontSize: 11, color: color.teal },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 26,
  },
  breakdownName: { flex: 1, fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  /* 割合は右端の金額と揃えたいので幅を固定する。可変にすると行ごとに金額の左端がずれる */
  breakdownShare: {
    width: 34,
    fontFamily: font.ui,
    fontSize: 10,
    color: color.textFaint,
    textAlign: "right",
  },
  breakdownValue: { ...numeric, fontSize: 12, color: color.textMain },
  breakdownDim: { color: color.textFaint },
  breakdownEmpty: {
    fontFamily: font.ui,
    fontSize: 12,
    color: color.textFaint,
    paddingVertical: spacing.sm,
  },
  breakdownHint: {
    fontFamily: font.ui,
    fontSize: 10,
    color: color.textFaint,
    marginTop: spacing.xs,
  },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  rankRow: { marginBottom: spacing.md },
  rankHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  rankName: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain, flex: 1 },
  rankValue: { ...numeric, fontSize: 13, color: color.tealDeeper },
  rankTrack: { height: 10, backgroundColor: color.divider, borderRadius: radius.pill, overflow: "hidden" },
  rankFill: { height: "100%", borderRadius: radius.pill },
});
