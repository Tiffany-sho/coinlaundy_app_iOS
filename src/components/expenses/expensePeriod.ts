import {
  currentMonthIndex,
  fromMonthIndex,
  monthIndexFromEpoch,
  monthKey,
  monthLabel,
  monthStartEpoch,
  toMonthIndex,
  type MonthIndex,
} from "@/components/revenue/monthIndex";

/**
 * 経費を「月ごと」に見るか「年ごと」に見るか（2026-08-05）。
 *
 * ⚠️ **管理タブの在庫 / 設備と同じ `SegmentedTabs` で切り替える。**
 *    アプリの中で「2 つの見方を切り替える」操作はこれ 1 種類に揃えてある。
 *
 * ⚠️ **単位を切り替えても送りの仕組み（`ChartPager`）は同じ。** 面が持つ期間の
 *    幅だけが変わるので、**画面側に月と年の分岐を撒かない。**
 *    ここで「1 面ぶんの期間」を作り、画面はそれを受け取るだけにする。
 */
export type ExpenseUnit = "month" | "year";

/** 送りの位置。月モードは月の連番、年モードは西暦そのもの */
export type ExpenseCursor = number;

export type ExpensePeriod = {
  /** 含む */
  from: number;
  /** ⚠️ **含む**（`GET /expenses` の `to` は `lte`。`/funds/chart` とは逆） */
  to: number;
  /** 見出し。「2026年8月」/「2026年」 */
  label: string;
  /** ChartPager の pageKey。⚠️ 単位をまたいで衝突しないよう接頭辞を付ける */
  key: string;
};

/** いま開くべき位置。月モードは今月、年モードは今年 */
export function currentCursor(unit: ExpenseUnit): ExpenseCursor {
  return unit === "month" ? currentMonthIndex() : fromMonthIndex(currentMonthIndex()).year;
}

/**
 * 単位を切り替えたときの移動先。
 *
 * ⚠️ **今の位置を保つ。** 2026-03 を見ているときに「年」へ切り替えたら
 *    2026 年を出す。今月・今年へ飛ばすと、過去を調べている途中で
 *    切り替えた人が**見ていた場所を見失う。**
 */
export function convertCursor(
  cursor: ExpenseCursor,
  from: ExpenseUnit,
  to: ExpenseUnit
): ExpenseCursor {
  if (from === to) return cursor;
  if (to === "year") return fromMonthIndex(cursor).year;
  /* 年 → 月。⚠️ **今年なら今月**（1 月に飛ばすと空の月が出ることが多い） */
  const now = currentMonthIndex();
  if (cursor === fromMonthIndex(now).year) return now;
  return toMonthIndex(cursor, 1);
}

/** その位置が指す期間。⚠️ `to` は「含む」 */
export function periodOf(unit: ExpenseUnit, cursor: ExpenseCursor): ExpensePeriod {
  if (unit === "month") {
    return {
      from: monthStartEpoch(cursor),
      to: monthStartEpoch(cursor + 1) - 1,
      label: monthLabel(cursor),
      key: `m${monthKey(cursor)}`,
    };
  }
  const start = toMonthIndex(cursor, 1);
  return {
    from: monthStartEpoch(start),
    /* ⚠️ 翌年 1 月の 1 ミリ秒前。翌年 1 月 1 日をそのまま渡すと 1 日ぶん混ざる */
    to: monthStartEpoch(toMonthIndex(cursor + 1, 1)) - 1,
    label: `${cursor}年`,
    key: `y${cursor}`,
  };
}

/**
 * 先へ送れるか。
 *
 * ⚠️ **未来は見せない。** 空の期間を無限にめくれてしまう。
 * ⚠️ **過去には下限を設けない。**「最初の経費がいつか」を返す API が無く、
 *    集金の最古月で代用すると**それより前に入れた経費に辿り着けなくなる。**
 */
export function canGoNext(unit: ExpenseUnit, cursor: ExpenseCursor): boolean {
  return cursor < currentCursor(unit);
}

export type MonthTotal = { month: MonthIndex; label: string; total: number; count: number };

/**
 * 年モードで出す「月ごとの小計」。
 *
 * ⚠️ **年モードで明細を 1 行ずつ並べない。** `ChartPager` は 3 面ぶんを
 *    同時にマウントするので、**3 年ぶんの行が仮想化されていない ScrollView に
 *    載る**（経費の多い組織では数百行）。実機で目に見えて重くなる。
 * ⚠️ **展開された固定費（`recurring: true`）も数える。** 除くと家賃を含まない
 *    「年の経費」になり、月モードの合計と足しても合わなくなる。
 * ⚠️ **金額が数値であることまで確かめる**（永続キャッシュで項目が欠けると NaN）。
 * ⚠️ **経費が 1 円も無い月は落とす。** 12 行を必ず並べると、
 *    使い始めた年に ¥0 の月がずらりと出る。
 */
export function monthlyTotals(
  expenses: readonly { date: number; amount: number }[]
): MonthTotal[] {
  const byMonth = new Map<MonthIndex, { total: number; count: number }>();

  for (const e of expenses) {
    if (!Number.isFinite(e?.date)) continue;
    const amount = Number.isFinite(e?.amount) ? e.amount : 0;
    const index = monthIndexFromEpoch(e.date);
    const row = byMonth.get(index) ?? { total: 0, count: 0 };
    byMonth.set(index, { total: row.total + amount, count: row.count + 1 });
  }

  return [...byMonth.entries()]
    /* ⚠️ 新しい順。月モードの明細（日付の新しい順）と向きを揃える */
    .sort((a, b) => b[0] - a[0])
    .map(([month, row]) => ({ month, label: monthLabel(month), ...row }));
}
