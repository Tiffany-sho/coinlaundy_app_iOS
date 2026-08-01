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

/**
 * 開発者からのお知らせ。組織に関係なく全ユーザー共通。
 *
 * ⚠️ 下書き（`published = false`）と期限切れは BFF が落とすので、ここには来ない。
 * ⚠️ 投稿は Supabase の Table Editor から手で行う。アプリからは読むだけ。
 */
export type Announcement = {
  id: string;
  /**
   * 公開日時の epoch（ミリ秒）。
   * ⚠️ BFF が ISO 文字列から畳んで返している。**アプリで ISO をパースしない**
   *    （Hermes のパースに寄りかかると実機だけ NaN になる。docs/traps.md 参照）。
   */
  publishedAt: number;
  /** "info" | "feature" | "maintenance" | "incident"。⚠️ 未知の値も来うる */
  category: string;
  title: string;
  /** プレーンテキスト。改行はそのまま出す（Markdown は解釈しない） */
  body: string;
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

/**
 * 店舗ごとの累計（/funds/summary/stores）。
 *
 * ⚠️ **全期間を見ている唯一の集計。** 月次サマリー（/funds/summary/monthly）は
 *    前年同月比のため過去 2 年に固定されているので、「いつから いつまで」「何回」を
 *    正しく出せるのはこちらだけ。総額収益カードの期間はここから作る。
 */
export type StoreRevenue = {
  laundryId: string;
  laundryName: string;
  total: number;
  /** 集金レコード数（全期間） */
  count: number;
  /** 最初の集金日。JST 深夜 0 時の epoch（ミリ秒）。1 件も無ければ null */
  firstDate: number | null;
  /** 最後の集金日。同上 */
  lastDate: number | null;
};

/**
 * 機器ごとの売上内訳（`GET /funds/summary/machines`）。金額はすべて**円**。
 *
 * ⚠️ **`machines` の和だけでは店舗の総額に届かない。**
 *    合計入力モードで登録された集金は `fundsArray` が空配列なので機器に
 *    割り振れず、`unattributed` に入る。**必ず両方を足して `total` と突き合わせること。**
 */
export type MachineBreakdown = {
  /** 売上の多い順。⚠️ 現在ある設備は 0 円でも並ぶ（故障中の台に気づけるように） */
  machines: { id: string; name: string; total: number }[];
  unattributed: {
    /** 合計入力モードで登録されたぶん */
    totalMode: number;
    /**
     * 機器にも合計入力にも紐づかないぶん（キャッシュレス・過去データのずれ）。
     * ⚠️ **負になり得る。** `fundsArray` の和が `totalFunds` を上回る古い行があると
     *    マイナスで出る。`Math.max(0, …)` で潰さないこと（ずれに気づけなくなる）。
     * ⚠️ **古い応答が react-query の永続キャッシュから復元されると `undefined`。**
     *    数値として使う前に `?? 0` を通すこと。
     */
    other: number;
  };
  /** ⚠️ machines の和 + unattributed の和 と一致する */
  total: number;
};

/**
 * 経費の 1 件（`GET /expenses`）。
 *
 * ⚠️ **`amount` の単位は「円」。** 集金の `fundsArray[].funds` は**硬貨の枚数**
 *    （金額は × 100）。同じアプリの中に単位の違う金額があるので取り違えないこと。
 * ⚠️ **`date` は JST 深夜 0 時の epoch（ミリ秒）。** 集金と同じ規約。
 * ⚠️ **`laundryId` が null なら「組織全体の経費」**（店舗に紐づかない支出）。
 */
export type Expense = {
  /**
   * ⚠️ **`recurring` が true のとき、この id は実在しない**
   *    （`recurring:<定義id>:<YYYY-MM>` 形式）。編集・削除に使わないこと。
   */
  id: string;
  laundryId: string | null;
  date: number;
  amount: number;
  category: string;
  note: string | null;
  /**
   * 毎月の固定費を展開したものか。
   * ⚠️ **true の項目に編集・削除の導線を出さない。** 実体が無く、サーバも 400 で弾く。
   * ⚠️ 古い応答が永続キャッシュから復元されると `undefined`。真偽で見ること。
   */
  recurring?: boolean;
  /** `recurring` が true のときだけ入る、元の定義の id */
  recurringId?: string;
};

/**
 * 毎月の固定費の**定義**（`GET /expenses/recurring`）。
 *
 * ⚠️ **実体の経費レコードは無い。** 一覧を読むときに各月へ展開される。したがって
 *    **金額を変えると過去の月まで遡って変わる。**「今月から上がった」を表すには
 *    `endMonth` を入れて終わらせ、新しい定義を作ること。
 */
export type RecurringExpense = {
  id: string;
  laundryId: string | null;
  name: string;
  amount: number;
  category: string;
  /** 1〜28。⚠️ 29 以上は不可（その日が無い月で計上が飛ぶ） */
  dayOfMonth: number;
  /** "YYYY-MM" */
  startMonth: string;
  /** "YYYY-MM"。null = 継続中 */
  endMonth: string | null;
};

/** データの書き出し形式。⚠️ BFF の FORMATS と同じ綴りにすること */
export type ExportFormat = "csv" | "xlsx";

/**
 * POST /api/v1/funds/export の戻り。
 *
 * ⚠️ **中身は base64。** そのままテキストとして書き出さないこと（開けないファイルになる）。
 *    `saveAndShareBase64` が `encoding: "base64"` を付けて書いている。
 * ⚠️ **返るファイルは必ず 1 つ。** iOS には共有シートしか出口が無く、
 *    複数ファイルだと数だけシートが開くため BFF 側でまとめてある。
 */
export type ExportFile = {
  format: ExportFormat;
  /** 保存時のファイル名。拡張子込み */
  name: string;
  base64: string;
  /** 書き出した集金レコードの件数。完了トーストに出す */
  recordCount: number;
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

/**
 * アクションログの 1 行。`GET /org/messages` が返す形。
 *
 * ⚠️ 以前ここは `{ id, created_at, message, [key: string]: unknown }` になっていたが
 *    **実際のテーブルに `created_at` は使われておらず、並び順も表示も `date`**
 *    （epoch ミリ秒）を見ている。インデックスシグネチャがあったせいで
 *    型エラーにならず、誰も気づかないままだった。
 *
 * ⚠️ `date` は **epoch ミリ秒**。ISO 文字列ではない
 *    （Hermes は ISO 以外を `Invalid Date` にする。docs/traps.md）。
 */
export type ActionMessage = {
  id: string;
  message: string;
  /** epoch ミリ秒。⚠️ 古い行は null のことがある */
  date: number | null;
  /** 自分の操作か。⚠️ サーバが判定して返す */
  isMe: boolean;
  /** 退会済みユーザーは null */
  username: string | null;
};

export type ActionMessagePage = {
  items: ActionMessage[];
  hasMore: boolean;
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
  /**
   * 支払方法 → その月の合計。**現金は `"cash"` の固定キー**（支払方法テーブルに
   * 現金の行は無く、総額からキャッシュレスを引いて出している）。
   *
   * ⚠️ **値の和は `total` と一致する。**
   * ⚠️ **古い応答が react-query の永続キャッシュから復元されると `undefined`。**
   *    `?? {}` を通してから読むこと（`Object.values(undefined)` は例外になる）。
   */
  byMethod?: Record<string, number>;
};

/** 現金を表す `byMethod` のキー。⚠️ uuid と衝突しない名前なのでそのまま使える */
export const CASH_METHOD_KEY = "cash";

/**
 * 組織の支払方法（PayPay・クレジットカードなど）。
 *
 * ⚠️ **現金は含まれない。** 常に存在する暗黙の方法なので、一覧に出すときは
 *    アプリ側が先頭に足すこと。サーバから行として返すと集金画面で
 *    現金を 2 回入力できてしまう。
 * ⚠️ 「削除」は物理削除ではなく `isActive: false`。**集金画面は必ず
 *    `isActive` で絞る**（設定画面は戻せるように無効なものも出す）。
 */
export type PaymentMethod = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};
