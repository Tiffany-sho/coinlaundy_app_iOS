import { storage } from "@/api/queryClient";
import type { Draft } from "./types";

/**
 * 集金フォームの下書き。
 *
 * Web は「一時保存」ボタンの手動保存だが、アプリは自動保存にする（設計図 7.4）。
 * MMKV は同期 API なので、入力のたびに書いても UI が止まらない。
 */
const key = (storeId: string) => `draft:${storeId}`;

export function loadDraft(storeId: string): Draft | null {
  const raw = storage.getString(key(storeId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Draft;
  } catch {
    storage.remove(key(storeId));
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  storage.set(key(draft.storeId), JSON.stringify({ ...draft, updatedAt: Date.now() }));
}

export function clearDraft(storeId: string): void {
  storage.remove(key(storeId));
}

/** 呼び出しから delay ms 変化がなければ保存する。連打しても書き込みは 1 回 */
export function createDebouncedSave(delay = 1500) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (draft: Draft) => {
    if (timer) clearTimeout(timer);
    timer = null;
    saveDraft(draft);
  };

  return {
    schedule(draft: Draft) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => saveDraft(draft), delay);
    },
    /** 画面を離れるときなど、待たずに書き切る */
    flush,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
