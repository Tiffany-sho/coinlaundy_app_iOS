/**
 * BFF（/api/v1）のレスポンス型。
 * 形は Web の Server Action の戻り値に合わせてある。勝手に変えないこと。
 */

export type Role = "admin" | "collecter" | "viewer";

/** laundry_store.machines の 1 要素 */
export type Machine = {
  id: string;
  name: string;
  [key: string]: unknown;
};

/**
 * laundry_store.images の 1 要素。
 * ⚠️ 文字列ではなくオブジェクト。Web も image.url で参照している（ImageCarusel.jsx）
 */
export type StoreImage = {
  url: string;
  path?: string;
  [key: string]: unknown;
};

export type Store = {
  id: string;
  store: string;
  location: string | null;
  description: string | null;
  machines: Machine[];
  images: StoreImage[] | null;
  owner: string;
  organization_id: string;
  created_at?: string;
};

export type Profile = {
  full_name: string | null;
  username: string | null;
  role: Role | null;
  collectMethod: string | null;
  avatar_url: string | null;
};

export type Organization = {
  id: string;
  name: string;
  myRole: Role;
};

export type PlanKey = "free" | "pro" | "max";

/**
 * 契約の出どころ。null = 有料契約なし。
 *
 * ⚠️ `"stripe"` の組織にアプリから購入させない。Apple と Stripe の両方から
 *    引き落とされ、Apple 側は Web から解約できないので返金対応になる。
 *    判定の正はサーバ（applyAppleTransaction）で、ここは UI の出し分け用。
 */
export type PlanSource = "stripe" | "apple" | null;

export type Plan = {
  plan: PlanKey | string;
  storeCount: number;
  /** 無制限プランは null */
  storeLimit: number | null;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  orgId: string;
  myRole: Role;
  planSource: PlanSource;
  appleProductId: string | null;
  /** ISO8601。App Store 側の失効時刻 */
  appleExpiresAt: string | null;
};

/** POST /api/v1/billing/apple/verify の戻り */
export type ApplePurchaseResult = {
  plan: PlanKey | string;
  planSource: PlanSource;
  productId: string | null;
  expiresAt: string | null;
  active: boolean;
};

/** organizations.collect_schedule。weekly は 0=日…6=土、monthly は 1…31 */
export type CollectSchedule =
  | { type: "weekly"; days: number[] }
  | { type: "monthly"; days: number[] };

export type Bootstrap = {
  user: { id: string; email: string | null };
  /** 未登録なら null → 初回セットアップへ */
  profile: Profile | null;
  /** 未所属なら null → 組織参加画面へ */
  organization: Organization | null;
  plan: Plan | null;
  collectSchedule: CollectSchedule | null;
};

export type RecentFund = {
  id: number | string;
  laundryName: string;
  totalFunds: number;
  /** JST 深夜 0 時の epoch（ミリ秒） */
  date: number;
  /** 集金者の表示名。退会済みユーザーは null */
  collecter: string | null;
};

export type HomeSummary = {
  /** 当月の集金合計（円） */
  monthTotal: number;
  /** 当月の集金回数（レコード数） */
  collectCount: number;
  recentFunds: RecentFund[];
  lowStockCount: number;
  brokenMachineCount: number;
};

/** 一覧に出る集金データ。明細（fundsArray）は含まないので詳細で別途取る */
export type FundListItem = {
  id: number | string;
  laundryId: string;
  laundryName: string;
  date: number;
  totalFunds: number;
  collecter: string | null;
  profiles?: { username: string | null } | null;
};

/**
 * collect_funds.fundsArray の 1 要素（機種ごとの集金）。
 *
 * ⚠️ funds の単位は「円」ではなく**枚数**。合計金額は funds の総和 × 100 で出す
 *    （Web の MachineAndFundsList.jsx が `reduce(...) * 100` で計算している）。
 *    円として扱うと 1/100 の金額になるので注意。
 */
export type FundEntry = {
  id: string;
  name: string;
  /** コインの枚数。金額は ×100 */
  funds: number;
  [key: string]: unknown;
};

/** 集金 1 件の明細。一覧には含まれないので詳細を開いたときだけ取る */
export type FundDetail = {
  fundsArray: FundEntry[] | null;
};

export type StoreRevenue = {
  laundryId: string;
  laundryName: string;
  total: number;
};

/** laundry_state.machines の 1 要素 */
export type MachineState = {
  id: string;
  name: string;
  break: boolean;
  comment: string;
};

export type ExtraStock = {
  id: string;
  name: string;
  count: number;
  threshold?: number;
};

export type LaundryState = {
  laundryId: string;
  laundryName: string;
  detergent: number;
  softener: number;
  machines: MachineState[];
  extra_stocks?: ExtraStock[] | null;
  stock_thresholds?: { detergent?: number; softener?: number } | null;
};

/** BFF のエラーコード（設計図 6.6） */
export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NO_ORG"
  | "PLAN_LIMIT"
  | "UPGRADE_REQUIRED"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  | "BAD_REQUEST"
  | "OFFLINE";

export type OrgMember = {
  id: string;
  user_id: string;
  role: Role;
  joined_at: string | null;
  profiles: { id: string; username: string | null; full_name: string | null };
};

export type MembersResponse = {
  members: OrgMember[];
  orgId: string;
  myRole: Role;
};

export type Invitation = {
  id: string;
  email: string;
  role: Role;
  created_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  token: string;
};

export type ActionMessage = {
  id: string | number;
  created_at: string;
  message?: string | null;
  [key: string]: unknown;
};

/** アカウント削除前に提示する影響範囲 */
export type DeletionSummary = {
  isOwner: boolean;
  orgName: string | null;
  storeCount: number;
  fundCount: number;
};

/** 月次の集金推移。BFF 側で月ごとに畳んだもの */
export type MonthlyPoint = {
  /** "2026-07" 形式 */
  month: string;
  total: number;
  /** その月の集金レコード数 */
  count: number;
  /**
   * その月に実際に集金があった店舗数（重複なし）。
   *
   * ⚠️ ホームの「1回あたり平均」はこの値ではなく count で割る
   *    （本家 SalesCardClient.jsx の FundsDisplay と同じ式）。
   *    この storeCount は「何店舗を回ったか」を出したいときに使うこと。
   *    組織の現在の店舗数（plan.storeCount）とは別物で、過去の月では一致しない。
   */
  storeCount: number;
};

/**
 * 任意期間の月次（/funds/chart?groupBy=month）。
 * MonthlyPoint に店舗ごとの内訳が付いたもの。積み上げ棒グラフの内訳に使う。
 *
 * ⚠️ MonthlyPoint（/funds/summary/monthly）は前年同月比のため**過去 2 年に固定**。
 *    任意の期間を出すときはこちらを使うこと。
 */
export type MonthlyChartPoint = MonthlyPoint & {
  /** laundryId → その月の合計。storeId 指定で取ると空になる */
  byStore: Record<string, number>;
};
