import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { HeroCard, MoneyText } from "@/components/ui";
import { useCardPaging } from "./useCardPaging";
import { nowInJst } from "@/shared/date";
import type { MonthlyPoint } from "@/api/types";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 月の集金カード。横スワイプで過去の月に戻れる（Web の SalesCardClient.jsx と同じ挙動）。
 *
 * Web はタッチ座標を自前で拾って 3 枚のカードを transform で動かしているが、
 * ネイティブでは ScrollView に寄せる。
 * 並びは古い月 → 新しい月（左 → 右）。右へスワイプすると先月が出てくる順序で、
 * これも Web（右スワイプ＝先月）と同じ向き。
 *
 * ⚠️ pagingEnabled は使わない。画面幅ちょうどでしか止まらないので、
 *    「隣のカードが少し見える」＝スライドできると分かる見た目と両立しない。
 *    カード幅を狭めて snapToInterval で止める（Web も calc(100% - 48px) + gap 8px で
 *    左右に 24px の覗き見を作っている）。
 */

/** 並べる月数の上限。ドットが並びきる範囲として「過去 1 年」に収める */
const MAX_MONTHS = 12;

/** 隣のカードが覗く幅。Web の calc(100% - 48px)（＝左右 24px ずつ）と同じ */
const PEEK = 24;

/** カード同士の間隔。Web の gap="8px" と同じ */
const GAP = 8;

type MonthCard = {
  /** "2026-07" 形式。MonthlyPoint.month と同じキー */
  key: string;
  year: number;
  /** 1-12 */
  month: number;
  total: number;
  /** その月の集金回数（レコード数）。1 回あたり平均の分母 */
  count: number;
};

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * useMonthlySummary() の結果を「当月まで途切れずに並んだ月の配列」に直す。
 *
 * BFF は集金レコードのある月しか返さないので、そのまま並べると集金の無い月が
 * 抜け落ちて隣の月と繋がってしまう。記録の無い月も ¥0 のカードとして挟む
 * （Web の「この月の集金記録はありません」に相当）。
 */
function buildMonths(data: MonthlyPoint[] | undefined): MonthCard[] {
  // 端末 TZ ではなく JST の「今月」を基準にする。月末深夜に 1 ヶ月ずれるため
  const now = nowInJst();
  // 年 * 12 + 月 の通し番号。月またぎを素朴な加算で書けるようにする
  const currentIndex = now.getFullYear() * 12 + now.getMonth();

  const points = data ?? [];
  const byMonth = new Map(points.map((point) => [point.month, point]));

  // MonthlyPoint は古い順で返ってくるので先頭が最古。データが無ければ当月だけ
  let startIndex = currentIndex;
  if (points.length > 0) {
    const [y, m] = points[0].month.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m)) {
      // 未来日付の集金が混ざっていても当月より先には並べない（Web も翌月へは進めない）
      startIndex = Math.min(y * 12 + (m - 1), currentIndex);
    }
  }
  startIndex = Math.max(startIndex, currentIndex - (MAX_MONTHS - 1));

  const months: MonthCard[] = [];
  for (let i = startIndex; i <= currentIndex; i += 1) {
    const year = Math.floor(i / 12);
    const month = (i % 12) + 1;
    const point = byMonth.get(monthKey(year, month));
    months.push({
      key: monthKey(year, month),
      year,
      month,
      total: point?.total ?? 0,
      count: point?.count ?? 0,
    });
  }
  return months;
}

export function MonthlySalesCarousel({
  data,
  isLoading,
  isError,
}: {
  data: MonthlyPoint[] | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const months = useMemo(() => buildMonths(data), [data]);
  const lastIndex = months.length - 1;

  const scrollRef = useRef<ScrollView>(null);
  /** 帯そのものの幅（画面幅からホームの padding を引いたもの） */
  const [trackWidth, setTrackWidth] = useState(0);

  // カード幅は左右の覗き見ぶんだけ狭く、止まる間隔はカード幅 + 隙間
  const cardWidth = Math.max(0, trackWidth - PEEK * 2);
  const interval = cardWidth > 0 ? cardWidth + GAP : 0;

  // 1 回のフリックで 1 枚だけ送る。ネイティブと Web で経路が違うので
  // useCardPaging に寄せてある（そちらのコメント参照）
  const { index, resetTo, cancelPending, handlers } = useCardPaging({
    interval,
    lastIndex,
    scrollRef,
  });

  // 初期表示は必ず当月（＝末尾）。幅が測れた時点と、データ到着で月数が増えた
  // 時点の両方で合わせ直す
  useEffect(() => {
    if (interval <= 0) return;
    scrollRef.current?.scrollTo({ x: interval * lastIndex, animated: false });
    resetTo(lastIndex);
  }, [interval, lastIndex, resetTo]);

  useEffect(() => cancelPending, [cancelPending]);

  function onLayout(e: LayoutChangeEvent) {
    const width = Math.round(e.nativeEvent.layout.width);
    if (width > 0 && width !== trackWidth) setTrackWidth(width);
  }

  return (
    <View>
      <View onLayout={onLayout}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          /* pagingEnabled は使わない（画面幅ぴったりでしか止まらず覗き見が作れない）。
             snapToInterval / disableIntervalMomentum はネイティブでの下支え。
             Web ではどちらも無視されるので useCardPaging が代わりに寄せる */
          snapToInterval={interval > 0 ? interval : undefined}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          scrollEventThrottle={16}
          {...handlers}
          contentContainerStyle={{ paddingHorizontal: PEEK }}
        >
          {/* 幅が測れるまではカードを組めない。1 フレームだけ最低高さで場所を確保する */}
          {interval > 0 ? (
            months.map((card, i) => (
              <View
                key={card.key}
                style={{ width: cardWidth, marginRight: i === lastIndex ? 0 : GAP }}
              >
                <MonthHero card={card} isLoading={isLoading} isError={isError} />
              </View>
            ))
          ) : (
            <View style={styles.track} />
          )}
        </ScrollView>
      </View>

      {months.length > 1 && (
        <View style={styles.dots}>
          {months.map((card, i) => (
            <View key={card.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

/** カード 1 枚。配色は表示中の月に追従する（HeroCard の MONTH_GRADIENT） */
function MonthHero({
  card,
  isLoading,
  isError,
}: {
  card: MonthCard;
  isLoading: boolean;
  isError: boolean;
}) {
  /**
   * 集金 1 回あたりの平均額。
   *
   * 本家 SalesCardClient.jsx の FundsDisplay と同じ式
   * （`Math.round(totalRevenue / collectCount)`。Web でのラベルは「平均単価」）。
   *
   * ⚠️ 分母は集金回数。店舗数で割ると「1 店舗あたり」になって別の数字になるので、
   *    ラベルと式は必ずセットで直すこと。
   *    集金が 1 件も無い月は 0 除算になるので、割らずに「—」を出す。
   */
  const perCollect = card.count > 0 ? Math.round(card.total / card.count) : null;

  return (
    <HeroCard month={card.month}>
      <Text style={styles.heroMonth}>
        {card.year}年{card.month}月の集金
      </Text>

      {isLoading ? (
        <View style={styles.heroPlaceholder}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : isError ? (
        <View style={styles.heroPlaceholder}>
          <Text style={styles.heroError}>データ取得失敗</Text>
        </View>
      ) : (
        /* ヒーローだけ ¥ を小さく分ける（Web の SalesCardClient と同じ組み方） */
        <MoneyText value={card.total} size={40} tone="onHero" splitSymbol />
      )}

      <View style={styles.heroChipRow}>
        <View style={styles.heroChip}>
          <Text style={styles.heroChipLabel}>集金回数</Text>
          <Text style={styles.heroChipValue}>{card.count}回</Text>
        </View>
        <View style={styles.heroChip}>
          <Text style={styles.heroChipLabel}>1回あたり平均</Text>
          {perCollect === null ? (
            <Text style={styles.heroChipValue}>—</Text>
          ) : (
            /* 平均額は splitSymbol を使わない（ui.tsx の MoneyText のコメント参照） */
            <MoneyText value={perCollect} size={16} tone="onHero" />
          )}
        </View>
      </View>
    </HeroCard>
  );
}

const styles = StyleSheet.create({
  track: { minHeight: 176 },
  heroMonth: {
    fontFamily: font.ui,
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginBottom: spacing.xs,
  },
  heroPlaceholder: { height: 40, justifyContent: "center", alignItems: "flex-start" },
  heroError: { fontFamily: font.ui, fontSize: 14, color: "#FFFFFF" },
  heroChipRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  heroChip: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  heroChipLabel: { fontFamily: font.ui, fontSize: 10, color: "rgba(255,255,255,0.8)" },
  heroChipValue: { fontFamily: font.uiBold, fontSize: 16, color: "#FFFFFF" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.cyan200 },
  dotActive: { width: 18, backgroundColor: color.teal },
});
