import { storage } from "@/api/queryClient";
import { apiFetch, ApiError } from "@/api/client";
import type { OutboxItem } from "./types";

const KEY = "outbox";

/** 設計図 9.2 の仕様 */
export const OUTBOX_LIMIT = 50;
const BACKOFF_MS = [2_000, 4_000, 8_000, 30_000];
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Listener = (items: OutboxItem[]) => void;
const listeners = new Set<Listener>();

export function readOutbox(): OutboxItem[] {
  const raw = storage.getString(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    storage.remove(KEY);
    return [];
  }
}

function writeOutbox(items: OutboxItem[]): void {
  storage.set(KEY, JSON.stringify(items));
  listeners.forEach((fn) => fn(items));
}

export function subscribeOutbox(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 未送信件数。バッジ表示に使う */
export function pendingCount(): number {
  return readOutbox().length;
}

export function isOutboxFull(): boolean {
  return readOutbox().length >= OUTBOX_LIMIT;
}

/**
 * 送信キューに積む。実際の送信は flushOutbox() が行う。
 * オンラインなら呼び出し側が続けて flush するので、体感は即時送信と変わらない。
 */
export function enqueue(
  payload: OutboxItem["payload"],
  clientRequestId: string
): OutboxItem {
  const items = readOutbox();
  if (items.length >= OUTBOX_LIMIT) {
    throw new Error("未送信データが上限に達しています。送信してから入力してください");
  }

  const item: OutboxItem = {
    id: clientRequestId,
    payload,
    clientRequestId,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    status: "pending",
  };

  writeOutbox([...items, item]);
  return item;
}

export function removeItem(id: string): void {
  writeOutbox(readOutbox().filter((i) => i.id !== id));
}

/** 失敗したまま残っている 1 件を、ユーザー操作で再試行させる */
export function retryItem(id: string): void {
  writeOutbox(
    readOutbox().map((i) =>
      i.id === id ? { ...i, status: "pending", attempts: 0, nextAttemptAt: 0 } : i
    )
  );
}

function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

let flushing = false;

/**
 * キューを 1 件ずつ直列に送る。
 *
 * 並列にすると失敗時にどこまで送れたか分からなくなるので、必ず順番に送る。
 * 4xx（409 を除く）は再送しても通らないので failed にして UI に残し、
 * ユーザーが編集するか破棄するかを選べるようにする。
 */
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;

  let sent = 0;
  let failed = 0;

  try {
    // ループ中に enqueue されても走査対象は開始時点のスナップショットに留める
    for (const snapshot of readOutbox()) {
      const current = readOutbox().find((i) => i.id === snapshot.id);
      if (!current || current.status === "failed") continue;
      if (current.nextAttemptAt > Date.now()) continue;

      // 24 時間を超えたものは自動再送をやめ、UI に残して判断を仰ぐ
      if (Date.now() - current.createdAt > MAX_AGE_MS) {
        markFailed(current.id, "24 時間送信できませんでした");
        failed += 1;
        continue;
      }

      try {
        await apiFetch("/funds", {
          method: "POST",
          body: current.payload,
          idempotencyKey: current.clientRequestId,
        });
        // 成功。同じキーで既に登録済みだった場合もサーバが 200 を返すので同じ扱い
        removeItem(current.id);
        sent += 1;
      } catch (e) {
        if (e instanceof ApiError && e.code === "CONFLICT") {
          // 既に登録済み。成功として破棄する（設計図 6.6）
          removeItem(current.id);
          sent += 1;
          continue;
        }

        if (e instanceof ApiError && e.isPermanent) {
          markFailed(current.id, e.message);
          failed += 1;
          continue;
        }

        // オフラインや 5xx。バックオフして次の機会に回す
        const attempts = current.attempts + 1;
        writeOutbox(
          readOutbox().map((i) =>
            i.id === current.id
              ? { ...i, attempts, nextAttemptAt: Date.now() + backoffFor(attempts) }
              : i
          )
        );
        // オフラインなら後続も通らないので打ち切る
        if (e instanceof ApiError && e.code === "OFFLINE") break;
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, failed };
}

function markFailed(id: string, message: string): void {
  writeOutbox(
    readOutbox().map((i) =>
      i.id === id ? { ...i, status: "failed", lastError: message } : i
    )
  );
}
