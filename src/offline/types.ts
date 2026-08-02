/** 集金入力の 1 行。funds は硬貨の枚数（金額ではない） */
export type FundEntry = {
  id: string;
  name: string;
  funds: number;
  /**
   * この機器で受け取ったキャッシュレス（機種別入力のときだけ）。
   *
   * ⚠️ **`amount` は「円」。** 同じ行の `funds` は硬貨の**枚数**なので単位が違う。
   * ⚠️ **`undefined` になり得る**（この項目を足す前の下書き・キュー、および
   *    合計入力で登録された集金）。読むときは `?? []` を通すこと。
   * ⚠️ **サーバはこれを足し合わせて `collect_funds.cashless`（列）を組み直す。**
   *    列のほうが「その集金の合計」で、月別売上・書き出し・支払方法別の集計は
   *    すべて列を見ている。片方だけ足すと総額と内訳が食い違う。
   */
  cashless?: CashlessEntry[];
};

/**
 * キャッシュレス決済の 1 行。
 *
 * ⚠️ **`amount` の単位は「円」。** 同じ画面の `FundEntry.funds` は**硬貨の枚数**で、
 *    金額にするには × 100 が要る。**取り違えると 1/100 になる。**
 * ⚠️ **`name` は送っても使われない**（サーバが `methodId` から引き直す）。
 *    ここに持っているのは下書きの復元と画面表示のためだけ。
 */
export type CashlessEntry = {
  methodId: string;
  name: string;
  /** 円。空欄は 0 として持ち、送信時にサーバ側で落とされる */
  amount: number;
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
   * キャッシュレスの内訳。
   * ⚠️ **`undefined` になり得る。** この項目を足す前に保存された下書きが
   *    MMKV に残っている端末があるため。復元時は必ず `?? []` を通すこと
   *    （型は必須に見えても実体が無い。TypeScript は何も言わない）。
   */
  cashless?: CashlessEntry[];
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
    /**
     * ⚠️ 機種別入力では各行に `cashless` が載る。合計入力では空配列。
     */
    fundsArray: (Omit<FundEntry, "cashless"> & {
      cashless?: { methodId: string; amount: number }[];
    })[];
    /**
     * ⚠️ **「現金ぶんの金額」であって総額ではない。** DB に入る `totalFunds` は
     *    現金 + キャッシュレスで、**サーバ（createData）が組み直す。**
     *    ここでキャッシュレスを足して送ると二重計上になる。
     */
    totalFunds: number;
    /**
     * 集金レベルのキャッシュレス。**合計入力のときだけ使う。**
     *
     * ⚠️ **機種別入力では空配列を送る。** 機器ごとの入力があるとサーバは
     *    そちらを正とし、ここは**黙って捨てられる**（二重計上を防ぐため）。
     * ⚠️ **`undefined` になり得る**（この項目を足す前にキューへ積まれた分）。
     *    サーバは未指定を空配列として扱うので、そのまま送ってよい。
     */
    cashless?: { methodId: string; amount: number }[];
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
