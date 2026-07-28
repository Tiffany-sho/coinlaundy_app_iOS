/**
 * ⚠️ Web の src/functions/makeDate/date.js からの移植（2 リポジトリ体制のためコピー運用）。
 * 変更するときは必ず Web 側と同時に直すこと。片方だけ直すと集計が 1 日ずれる。
 * 元の関数名は getEpochTimeInSeconds だが、返すのは**ミリ秒**。名前に引きずられないこと。
 */

/** JST は UTC+9。ミリ秒での差分 */
const EPOCH_ERROR = 32_400_000;

/**
 * 年月日から「JST 深夜 0 時ちょうど」の epoch（ミリ秒）を作る。
 *
 * iOS の DatePicker が返す Date をそのまま getTime() すると端末 TZ 依存で 1 日ずれる。
 * 必ず年・月・日だけを取り出してこの関数に通すこと。
 *
 * @param month 1-12（0 始まりではない）
 */
export function getEpochTimeInSeconds(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) - EPOCH_ERROR;
}

/** 端末 TZ に関係なく「JST での今」を表す Date を返す */
export function nowInJst(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
}

/** DatePicker が返すローカル Date を JST 深夜 0 時の epoch に正規化する */
export function toJstMidnightEpoch(date: Date): number {
  return getEpochTimeInSeconds(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** epoch（ミリ秒）を "2026/7/27" 形式にする。Web の createNowData と同じ */
export function formatJstDate(epochMs: number): string {
  const d = new Date(epochMs + EPOCH_ERROR);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** epoch（ミリ秒）を "7/27 14:32" 形式にする。オフラインバナーの最終更新表示用 */
export function formatJstDateTime(epochMs: number): string {
  const d = new Date(epochMs + EPOCH_ERROR);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hh}:${mm}`;
}

/** 当月の 1 日 0 時（JST）の epoch */
export function startOfThisMonthJst(): number {
  const now = nowInJst();
  return getEpochTimeInSeconds(now.getFullYear(), now.getMonth() + 1, 1);
}
