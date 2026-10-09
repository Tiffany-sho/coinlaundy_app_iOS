import { useCallback, useState } from "react";
import { useMonthlyChart } from "@/api/queries";
import { oldestMonth } from "@/components/revenue/monthlySeries";
import {
  currentMonthIndex,
  monthKey,
  monthStartEpoch,
  type MonthRange as Range,
} from "@/components/revenue/monthIndex";
import type { StoreRevenue } from "@/api/types";

/** 既定は直近 12 か月 */
const DEFAULT_MONTHS = 12;

/**
 * 「期間を選ぶ + 前後へ送る」の共通部分。
 *
 * 月別売上（`MonthlyRevenueCard`）と機器別（`MachineBreakdownCard`）が
 * 同じ操作を持つので、**見た目は各カード、仕組みはここ**と分けてある。
 * ⚠️ どちらかにだけ直しを入れないこと。送り幅や下限の考え方はここが正。
 *
 * ⚠️ **前後も先に取っておく。** 指で引いている最中に隣の期間を見せるため。
 *    `useMonthlyChart` のキーは epoch の組なので、一度見た期間へ戻るときは
 *    react-query のキャッシュから即座に出る（送るたびに取り直さない）。
 */
export function usePeriodPager({
  stores,
  storeId,
  fetchCharts = true,
}: {
  /** 遡れる下限を決めるのに使う（最初の集金がある月まで） */
  stores: StoreRevenue[];
  /**
   * 1 店舗だけを見るときの店舗 ID。
   * ⚠️ **店舗別ページでは必ず渡すこと。** 省くと `count` が組織全体の回数になる。
   */
  storeId?: string;
  /**
   * 月別売上のデータを取るか。
   *
   * ⚠️ **期間の操作だけ借りたいカードは `false` にすること。**
   *    このフックは前後を先読みするので `useMonthlyChart` を 3 本張る。
   *    自前で別のデータを取るカード（機器別）では 3 本とも無駄になる。
   *    ⚠️ `false` のときは `chart` / `prevChart` / `nextChart` の `data` が
   *    常に undefined。**中身を読むカードで false にしないこと。**
   */
  fetchCharts?: boolean;
}) {
  const current = currentMonthIndex();
  const [range, setRange] = useState<Range>({
    start: current - (DEFAULT_MONTHS - 1),
    end: current,
  });

  /** 選んでいる期間ぶんまるごとずらす（5 年なら 5 年前へ、3 か月なら 3 か月前へ） */
  const span = range.end - range.start + 1;
  const prevRange: Range = { start: range.start - span, end: range.end - span };
  const nextRange: Range = { start: range.start + span, end: range.end + span };

  /**
   * 遡れる下限は**最初の集金がある月**まで。
   * ⚠️ 無いと空のグラフを無限にめくれてしまう。1 件も無い組織は今月で止める。
   */
  const oldest = oldestMonth(stores) ?? current;
  const canPrev = prevRange.end >= oldest;
  const canNext = range.end < current;

  // ⚠️ to は排他。終了月を含めたいので翌月 1 日を渡す
  const chart = useMonthlyChart(
    monthStartEpoch(range.start),
    monthStartEpoch(range.end + 1),
    fetchCharts,
    storeId
  );
  const prevChart = useMonthlyChart(
    monthStartEpoch(prevRange.start),
    monthStartEpoch(prevRange.end + 1),
    fetchCharts && canPrev,
    storeId
  );
  const nextChart = useMonthlyChart(
    monthStartEpoch(nextRange.start),
    monthStartEpoch(nextRange.end + 1),
    fetchCharts && canNext,
    storeId
  );

  const onPage = useCallback((direction: -1 | 1) => {
    setRange((r) => {
      const width = r.end - r.start + 1;
      return { start: r.start + width * direction, end: r.end + width * direction };
    });
  }, []);

  return {
    current,
    range,
    setRange,
    prevRange,
    nextRange,
    canPrev,
    canNext,
    onPage,
    /** ⚠️ 期間ごとに一意。ChartPager がこれを見て位置を戻す */
    pageKey: monthKey(range.start),
    chart,
    prevChart,
    nextChart,
    /** 既定（直近 12 か月）から動いているか。絞り込みボタンの点に使う */
    isDefaultRange: range.end === current && range.start === current - (DEFAULT_MONTHS - 1),
  };
}
