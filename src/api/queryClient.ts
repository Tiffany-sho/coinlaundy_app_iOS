import { createMMKV } from "react-native-mmkv";
import { QueryClient } from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";
import { ApiError } from "./client";

/**
 * MMKV は同期 API なので、下書きの自動保存やキャッシュの書き込みが UI を止めない。
 * AsyncStorage だと debounce 保存が非同期になり、アプリが落ちた瞬間の取りこぼしが出る。
 *
 * react-native-mmkv v4 から `new MMKV()` ではなく createMMKV() を使う（MMKV は型のみ）。
 */
export const storage = createMMKV({ id: "collecie" });

const CACHE_KEY = "rq-cache";

/** MMKV を裏に置いた TanStack Query の永続化アダプタ */
export const mmkvPersister: Persister = {
  persistClient: async (client) => {
    storage.set(CACHE_KEY, JSON.stringify(client));
  },
  restoreClient: async () => {
    const raw = storage.getString(CACHE_KEY);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      storage.remove(CACHE_KEY);
      return undefined;
    }
  },
  removeClient: async () => {
    storage.remove(CACHE_KEY);
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 圏外でもキャッシュを出したいので長めに保持する
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 日
      staleTime: 1000 * 60 * 5, // 5 分
      retry: (failureCount, error) => {
        // 4xx はリトライしても無駄。オフラインは復帰時に再取得されるので 2 回まで
        if (error instanceof ApiError && error.isPermanent) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});
