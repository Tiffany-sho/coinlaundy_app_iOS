import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queries";
import { flushOutbox, readOutbox, subscribeOutbox } from "./outbox";
import type { OutboxItem } from "./types";

type OutboxState = {
  items: OutboxItem[];
  pendingCount: number;
  failedCount: number;
  isOnline: boolean;
  flush: () => Promise<void>;
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
    }),
    [items, isOnline, flush]
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox() {
  const ctx = useContext(OutboxContext);
  if (!ctx) throw new Error("useOutbox は OutboxProvider の内側で呼ぶこと");
  return ctx;
}
