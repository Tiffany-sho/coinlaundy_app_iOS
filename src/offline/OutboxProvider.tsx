import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queries";
import { flushOutbox, readOutbox, removeItem, retryAllFailed, subscribeOutbox } from "./outbox";
import type { OutboxItem } from "./types";

type OutboxState = {
  items: OutboxItem[];
  pendingCount: number;
  failedCount: number;
  isOnline: boolean;
  flush: () => Promise<void>;
  /**
   * 失敗した分を送信待ちへ戻してから送る。**ユーザーが押したときだけ。**
   * ⚠️ `flush()` は failed を読み飛ばすので、混ぜないこと（区別が消える）。
   */
  retryFailed: () => Promise<void>;
  /** 送っても通らない 1 件を捨てる。⚠️ 呼び出し側で必ず確認を取ること */
  discard: (id: string) => void;
};

const OutboxContext = createContext<OutboxState | null>(null);

/**
 * 送信キューの再送トリガをまとめる（設計図 9.2）。
 *   ① アプリ復帰（AppState → active）
 *   ② ネット復帰（NetInfo）
 *   ③ 手動プル（画面側から flush() を呼ぶ）
 */
export function OutboxProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<OutboxItem[]>(() => readOutbox());
  const [isOnline, setIsOnline] = useState(true);

  const flush = useCallback(async () => {
    const { sent } = await flushOutbox();
    // 送信できた分だけ一覧と集計を取り直す
    if (sent > 0) {
      queryClient.invalidateQueries({ queryKey: queryKeys.home });
      queryClient.invalidateQueries({ queryKey: queryKeys.funds });
    }
  }, [queryClient]);

  /*
    ⚠️ **戻してから flush する。** `flushOutbox` は failed を読み飛ばすので、
       戻さずに呼んでも失敗した分は 1 件も送られない。
  */
  const retryFailed = useCallback(async () => {
    retryAllFailed();
    await flush();
  }, [flush]);

  const discard = useCallback((id: string) => removeItem(id), []);

  useEffect(() => subscribeOutbox(setItems), []);

  useEffect(() => {
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void flush();
    });

    const netSub = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online) void flush();
    });

    // 起動直後にも 1 回試す（前回の圏外分が残っている可能性がある）
    void flush();

    return () => {
      appStateSub.remove();
      netSub();
    };
  }, [flush]);

  const value = useMemo<OutboxState>(
    () => ({
      items,
      pendingCount: items.filter((i) => i.status === "pending").length,
      failedCount: items.filter((i) => i.status === "failed").length,
      isOnline,
      flush,
      retryFailed,
      discard,
    }),
    [items, isOnline, flush, retryFailed, discard]
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox() {
  const ctx = useContext(OutboxContext);
  if (!ctx) throw new Error("useOutbox は OutboxProvider の内側で呼ぶこと");
  return ctx;
}
