import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { HeroCard, MoneyText } from "@/components/common/ui";
import { useCardSwipe } from "@/components/home/useCardSwipe";
import { nowInJst } from "@/shared/date";
import type { MonthlyPoint } from "@/api/types";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 月の集金カード。横スワイプで過去の月に戻れる（Web の SalesCardClient.jsx と同じ挙動）。
 *
 * 並びは古い月 → 新しい月（左 → 右）。右へ払うと先月が出てくる順序で、
 * これも Web（右スワイプ＝先月）と同じ向き。
 *
 * ⚠️ ScrollView に載せないこと。ブラウザ標準のスクロール（＝スライド）に乗るだけで、
 *    指で払う操作にならない。指の動きは useCardSwipe（PanResponder）で直接取り、
 *    ここは transform をあてるだけにする。経緯はそちらのコメントを見ること。
 *
 * 左右 24px ずつ隣のカードを覗かせるのは Web と同じ（calc(100% - 48px) + gap 8px）。
 * 「まだ続きがある」と分かる見た目を作るため。
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

  /** 帯そのものの幅（画面幅からホームの padding を引いたもの） */
  const [trackWidth, setTrackWidth] = useState(0);

  // カード幅は左右の覗き見ぶんだけ狭く、送り幅はカード幅 + 隙間
  const cardWidth = Math.max(0, trackWidth - PEEK * 2);
  const interval = cardWidth > 0 ? cardWidth + GAP : 0;

  // 指の動きを直接取って 1 枚ずつ送る（そちらのコメント参照）
  const { index, translateX, panHandlers, goTo } = useCardSwipe({
    count: months.length,
    interval,
    peek: PEEK,
  });

  function onLayout(e: LayoutChangeEvent) {
    const width = Math.round(e.nativeEvent.layout.width);
    if (width > 0 && width !== trackWidth) setTrackWidth(width);
  }

  return (
    <View>
      {/* 帯からはみ出したカードは見せない。ここが窓になる */}
      <View onLayout={onLayout} style={styles.viewport}>
        {/* 幅が測れるまではカードを組めない。1 フレームだけ最低高さで場所を確保する */}
        {interval > 0 ? (
          <Animated.View
            style={[
              styles.row,
              { width: interval * months.length, transform: [{ translateX }] },
            ]}
            {...panHandlers}
          >
            {months.map((card) => (
              <View key={card.key} style={{ width: cardWidth, marginRight: GAP }}>
                <MonthHero card={card} isLoading={isLoading} isError={isError} />
              </View>
            ))}
          </Animated.View>
        ) : (
          <View style={styles.track} />
        )}
      </View>

      {months.length > 1 && (
        <View style={styles.dots}>
          {months.map((card, i) => (
            /* 端の月まで払い続けるのは面倒なので、ドットからも直接飛べるようにする */
            <Pressable
              key={card.key}
              onPress={() => goTo(i)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${card.year}年${card.month}月を表示`}
              accessibilityState={{ selected: i === index }}
            >
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </Pressable>
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
  /* 窓。ここからはみ出したカードは切り取る */
  viewport: { overflow: "hidden" },
  row: { flexDirection: "row" },
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
