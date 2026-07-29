import { formatJstDate } from "@/shared/date";
import type { FundListItem } from "@/api/types";

/**
 * 売上履歴の行を組み立てる。
 *
 * 画面から切り離して**純関数**にしてある。理由は「さらに表示」が出たり出なかったりする
 * 原因を追うのに、FlashList の中を覗かずに条件だけ確かめられるようにするため。
 * ここを変えるときは、末尾に必ず more か end のどちらかが 1 行入ることを保つこと。
 */

/** 退会済みで profiles が引けない集金の表示名（Web も同じ扱い） */
export const UNKNOWN_COLLECTER = "退会済みユーザー";

/**
 * 一度に出す量。
 *
 * ⚠️ これは**受け取ったあとの出し分け**であって、取得する範囲ではない。
 *    並び替えは常に全データに対してサーバが済ませてある（useFundHistory）。
 *    ここを絞っても「売上が高い順」の先頭は全期間の最高額のまま。
 *
 * 日付順は月でまとまるので月単位、売上順は月に意味が無いので件数で刻む。
 */
export const MONTHS_PER_PAGE = 3;
export const ROWS_PER_PAGE = 50;

/** 「さらに表示」の初期値。日付順なら月数、売上順なら件数 */
export function initialLimit(grouped: boolean): number {
  return grouped ? MONTHS_PER_PAGE : ROWS_PER_PAGE;
}

/** 「さらに表示」1 回ぶん */
export function limitStep(grouped: boolean): number {
  return grouped ? MONTHS_PER_PAGE : ROWS_PER_PAGE;
}

/** 履歴の 1 行。月の見出しと集金 1 件が同じリストに混ざる */
export type HistoryRow =
  | {
      kind: "month";
      key: string;
      /** "2026-07" 形式。折りたたみの管理キー */
      month: string;
      label: string;
      count: number;
      total: number;
      collapsed: boolean;
    }
  | { kind: "fund"; key: string; item: FundListItem }
  /** 「さらに表示」。remaining は**まだ出していない**月数（日付順）か件数（売上順） */
  | { kind: "more"; key: string; remaining: number; unit: "month" | "row" }
  /**
   * 「すべて表示しました」。
   * ⚠️ 何も出さないと「さらに表示が消えた」のか「元から出ていない」のか区別が付かない。
   *    出し切ったことを必ず言葉にする（これが無くて実際に混乱した）。
   */
  | { kind: "end"; key: string; fundCount: number };

export function collecterName(item: FundListItem): string {
  return item.profiles?.username ?? UNKNOWN_COLLECTER;
}

/**
 * 集金 1 件の金額。
 *
 * ⚠️ `item.totalFunds` を素で足したり引いたりしないこと。欠けている行があると
 *    月見出しの合計が NaN になり、金額での比較関数も NaN を返す。
 *    比較関数が NaN を返すと**並び順が変わらないうえエラーも出ない**
 *    （店舗一覧の登録日順で実際にこれを踏んだ）。
 */
export function fundAmount(item: FundListItem): number {
  const value = item.totalFunds;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * epoch（ミリ秒）から JST の年月を出す。
 * ⚠️ 端末 TZ で組むと月末深夜に 1 か月ずれるので、必ず formatJstDate 経由で分解すること。
 */
export function jstYearMonth(epochMs: number): { key: string; label: string } {
  const [year, month] = formatJstDate(epochMs).split("/");
  return { key: `${year}-${month.padStart(2, "0")}`, label: `${year}年${Number(month)}月` };
}

export function buildHistoryRows({
  items,
  grouped,
  collapsed,
  limit,
}: {
  /**
   * **全期間ぶんの集金。サーバが並べた順のまま渡すこと。**
   * ⚠️ ここで並べ替えない。取得を期間で区切ってもいけない。どちらをやっても
   *    「売上が高い順」の先頭が全期間の最高額でなくなる（本家も DB の ORDER BY）。
   */
  items: FundListItem[];
  /**
   * 月の見出しでまとめるか。
   * ⚠️ 金額順のときは false にすること。売上の高い順に並んだものを月で区切っても
   *    区切りが何も意味しない（Web の CoinManyDataTable も日付順以外では畳まない）。
   */
  grouped: boolean;
  /** 畳んである月のキー（"2026-07"） */
  collapsed: string[];
  /** 一度に出す量。日付順なら月数、売上順なら件数。**並び替えの対象は絞らない** */
  limit: number;
}): HistoryRow[] {
  if (items.length === 0) return [];

  if (!grouped) {
    const shown = items.slice(0, limit);
    const out: HistoryRow[] = shown.map((item) => ({
      kind: "fund",
      key: `f:${item.id}`,
      item,
    }));
    const remaining = items.length - shown.length;
    out.push(
      remaining > 0
        ? { kind: "more", key: "more", remaining, unit: "row" }
        : { kind: "end", key: "end", fundCount: items.length }
    );
    return out;
  }

  const groups = new Map<string, FundListItem[]>();
  for (const item of items) {
    const { key } = jstYearMonth(item.date);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const months = [...groups.entries()];
  const shownMonths = months.slice(0, limit);

  const out: HistoryRow[] = [];
  for (const [month, monthItems] of shownMonths) {
    const isCollapsed = collapsed.includes(month);
    out.push({
      kind: "month",
      key: `m:${month}`,
      month,
      label: jstYearMonth(monthItems[0].date).label,
      count: monthItems.length,
      total: monthItems.reduce((sum, item) => sum + fundAmount(item), 0),
      collapsed: isCollapsed,
    });
    if (isCollapsed) continue;
    for (const item of monthItems) out.push({ kind: "fund", key: `f:${item.id}`, item });
  }

  const remainingMonths = months.length - shownMonths.length;
  out.push(
    remainingMonths > 0
      ? { kind: "more", key: "more", remaining: remainingMonths, unit: "month" }
      : { kind: "end", key: "end", fundCount: items.length }
  );
  return out;
}
