import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import type { FundListItem } from "@/api/types";

/**
 * 集金詳細に渡す前情報を、一覧のキャッシュから拾うためのもの。
 *
 * GET /funds/:id は fundsArray しか返さない（BFF の getFundItemById が
 * select("fundsArray")）ので、店舗名・日付・合計・集金者は一覧から持ってくるしかない。
 */

/** queryKeys.funds は ["funds"]。その配下の一覧キャッシュを前方一致で全部見る */
const FUNDS_PREFIX = ["funds"] as const;

/**
 * 一覧のキャッシュから 1 件を探す。取得はしない（キャッシュのみ）。
 *
 * ⚠️ **形が 2 つある。** 片方だけ見ると、その画面から開いたときだけ
 *    店舗名や日付が空になる（型エラーにはならない）。
 *      - useFundList     … ["funds","list",…]    InfiniteData<FundListItem[]>
 *      - useFundHistory  … ["funds","history",…] FundListItem[]
 *    どちらも ["funds"] 配下なので前方一致で拾い、中身の形で振り分ける。
 */
export function findFundInCache(client: QueryClient, id: string): FundListItem | undefined {
  const caches = client.getQueriesData<InfiniteData<FundListItem[]> | FundListItem[]>({
    queryKey: FUNDS_PREFIX,
  });

  for (const [, data] of caches) {
    for (const page of toPages(data)) {
      const hit = page.find((row) => String(row.id) === id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** どちらの形でも「ページの配列」に均す。集計系など無関係なキャッシュは空で返す */
function toPages(data: unknown): FundListItem[][] {
  if (Array.isArray(data)) {
    // FundListItem[] か、そうでない別のクエリの配列か。id を持つものだけ通す
    return data.length === 0 || isFundRow(data[0]) ? [data as FundListItem[]] : [];
  }
  const pages = (data as InfiniteData<FundListItem[]> | undefined)?.pages;
  return Array.isArray(pages) ? pages : [];
}

function isFundRow(value: unknown): boolean {
  return typeof value === "object" && value !== null && "id" in value && "totalFunds" in value;
}

/** 未指定と空文字はどちらも「無し」として扱う。Number("") は 0（＝1970 年）になるため */
export function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function orNull(value: string | undefined): string | null {
  return value ? value : null;
}

export function toInt(value: string | undefined): number {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** ApiError のメッセージは BFF が返した日本語なので、言い換えずそのまま見せる */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
