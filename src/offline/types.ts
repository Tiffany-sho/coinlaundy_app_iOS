/** 集金入力の 1 行。funds は硬貨の枚数（金額ではない） */
export type FundEntry = {
  id: string;
  name: string;
  funds: number;
};

/** 集金フォームの下書き。storeId ごとに 1 件だけ持つ */
export type Draft = {
  storeId: string;
  storeName: string;
  /** JST 深夜 0 時の epoch（ミリ秒） */
  date: number;
  /** 機種別入力か合計入力か */
  method: "byMachine" | "total";
  fundsArray: FundEntry[];
  /** 合計入力モードのときだけ使う金額 */
  totalInput: number;
  /**
   * 画面を開いた時点で発行する uuid v4。
   * 下書き → Outbox → 送信まで持ち回り、再送しても二重登録されないようにする。
   */
  clientRequestId: string;
  updatedAt: number;
};

export type OutboxStatus = "pending" | "failed";

/** 送信キューの 1 件 */
export type OutboxItem = {
  id: string;
  /** そのまま POST /funds の body になる */
  payload: {
    storeId: string;
    store: string;
    date: number;
    fundsArray: FundEntry[];
    totalFunds: number;
  };
  /** Idempotency-Key。payload と 1 対 1 */
  clientRequestId: string;
  createdAt: number;
  attempts: number;
  /** 次に送ってよい時刻（指数バックオフ） */
  nextAttemptAt: number;
  status: OutboxStatus;
  lastError?: string;
};
