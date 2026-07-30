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
 * 未読の件数。0 ならバッジを出さない。
 *
 * ⚠️ MMKV は変更通知を持たないので `useSyncExternalStore` に自前の購読者を渡している。
 *    これが無いと、お知らせを読んだあと設定タブに戻ってもバッジが消えない
 *    （設定タブはマウントされたまま残るので再描画が起きない）。
 */
export function useUnreadAnnouncementCount(items: Announcement[] | undefined): number {
  const lastSeenAt = useSyncExternalStore(subscribe, getLastSeenAt, getLastSeenAt);
  return (items ?? []).filter((item) => item.publishedAt > lastSeenAt).length;
}

/** 一覧の中で一番新しい公開日時。空なら 0 */
export function latestPublishedAt(items: Announcement[] | undefined): number {
  let latest = 0;
  for (const item of items ?? []) {
    if (item.publishedAt > latest) latest = item.publishedAt;
  }
  return latest;
}
