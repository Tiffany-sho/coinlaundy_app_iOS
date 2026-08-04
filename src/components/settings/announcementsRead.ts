import { useSyncExternalStore } from "react";
import { storage } from "@/api/queryClient";
import type { Announcement } from "@/api/types";

/**
 * お知らせの既読管理。
 *
 * 持つのは「最後に見たお知らせの公開日時（epoch ミリ秒）」1 つだけ。
 * それより新しいものが 1 件でもあれば未読とみなす。
 *
 * ⚠️ **端末ローカル（MMKV）に持つ。サーバには無い。** つまり
 *    - 機種変更・アプリの入れ直しでリセットされる
 *    - 同じ人が 2 台使うと片方だけ既読になる
 *    テーブルを増やさない代わりにこれを許容している。正確に持つなら
 *    `announcement_reads` を作ることになる。
 *
 * ⚠️ **1 件ずつの既読にしない。** 個別に持つと、あとから過去日で投稿したものが
 *    永久に未読のまま残る。「どこまで見たか」を 1 本の線で持つほうが破綻しない。
 */

const KEY = "announcements.lastSeenAt";

/** useSyncExternalStore に渡す購読者。MMKV は変更通知を持たないので自前で配る */
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 既読の線。まだ一度も開いていなければ 0。
 *
 * ⚠️ 一覧画面は**開いた瞬間にこの値を写して**から `markAnnouncementsSeen` を呼ぶこと。
 *    写さずに参照すると、開いた直後に全件が既読になって「どれが新しかったか」が
 *    1 つも分からなくなる。
 */
export function getLastSeenAt(): number {
  return storage.getNumber(KEY) ?? 0;
}

/**
 * 一覧を開いたときに呼ぶ。⚠️ **引数は「今」ではなく一番新しいお知らせの公開日時。**
 *    now を入れると、直後に過去日で投稿されたお知らせが未読にならない。
 */
export function markAnnouncementsSeen(latestPublishedAt: number) {
  if (!Number.isFinite(latestPublishedAt)) return;
  if (latestPublishedAt <= getLastSeenAt()) return;
  storage.set(KEY, latestPublishedAt);
  emit();
}

/**
 * 未読とみなす下限。**既読の線と「アカウントを作った時刻」の新しいほう。**
 *
 * ⚠️ **登録より前に公開されたお知らせを未読にしない**（2026-08-05）。
 *    既読の線は端末ローカルで、新規登録した直後は必ず 0。そのままだと
 *    **過去のお知らせが全部未読**になり、初めて開いた画面にいきなり
 *    バッジが付いた状態で始まる。自分が使い始める前の告知なので、
 *    「まだ読んでいない」と言われても意味が無い。
 *
 * ⚠️ **`createdAt` は無いことがある**（古い応答が永続キャッシュから復元される／
 *    サーバが時刻を読めなかった）。そのときは 0 に倒す＝**これまでどおり全部未読**。
 *    ここで「今」に倒すと、無い間に公開されたお知らせが**永久に未読にならない。**
 */
export function unreadSince(
  lastSeenAt: number,
  accountCreatedAt: number | null | undefined
): number {
  const created = Number.isFinite(accountCreatedAt) ? (accountCreatedAt as number) : 0;
  return Math.max(lastSeenAt, created);
}

/**
 * 未読の件数。0 ならバッジを出さない。
 *
 * ⚠️ MMKV は変更通知を持たないので `useSyncExternalStore` に自前の購読者を渡している。
 *    これが無いと、お知らせを読んだあと設定タブに戻ってもバッジが消えない
 *    （設定タブはマウントされたまま残るので再描画が起きない）。
 */
export function useUnreadAnnouncementCount(
  items: Announcement[] | undefined,
  /** `bootstrap.data?.user?.createdAt`。⚠️ 渡さないと登録前のお知らせも未読になる */
  accountCreatedAt?: number | null
): number {
  const lastSeenAt = useSyncExternalStore(subscribe, getLastSeenAt, getLastSeenAt);
  const since = unreadSince(lastSeenAt, accountCreatedAt);
  return (items ?? []).filter((item) => item.publishedAt > since).length;
}


/** 一覧の中で一番新しい公開日時。空なら 0 */
export function latestPublishedAt(items: Announcement[] | undefined): number {
  let latest = 0;
  for (const item of items ?? []) {
    if (item.publishedAt > latest) latest = item.publishedAt;
  }
  return latest;
}
