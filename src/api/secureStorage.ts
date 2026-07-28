import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * expo-secure-store は 1 項目あたり 2048 バイト制限がある。
 * Supabase のセッション JSON（access_token + refresh_token + user）は環境により
 * これを超え、素直に渡すと「サイレントに保存失敗 → 毎回ログアウト」になる。
 *
 * そのためチャンク分割して保存する。
 *   <key>_n   … チャンク数
 *   <key>_0.. … 本体
 */
const CHUNK_SIZE = 1800;

/**
 * ⚠️ expo-secure-store は web に実装がない（ExpoSecureStore.web.js が空）。
 * Expo の web プレビューで画面を確認するためだけの localStorage フォールバック。
 *
 * localStorage は暗号化されない。実機（iOS）では必ず SecureStore 側を通るので、
 * このフォールバックが本番のセッション保存に使われることはない。
 */
const store =
  Platform.OS === "web"
    ? {
        getItemAsync: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
        setItemAsync: async (key: string, value: string) => {
          globalThis.localStorage?.setItem(key, value);
        },
        deleteItemAsync: async (key: string) => {
          globalThis.localStorage?.removeItem(key);
        },
      }
    : SecureStore;

const countKey = (key: string) => `${key}_n`;
const chunkKey = (key: string, i: number) => `${key}_${i}`;

async function readCount(key: string): Promise<number> {
  const raw = await store.getItemAsync(countKey(key));
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const count = await readCount(key);
    if (count === 0) return null;

    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => store.getItemAsync(chunkKey(key, i)))
    );

    // 1 つでも欠けていたら壊れた保存とみなす。中途半端に復元するより再ログインさせる
    if (parts.some((p) => p == null)) {
      await LargeSecureStore.removeItem(key);
      return null;
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    const previousCount = await readCount(key);

    const parts: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      parts.push(value.slice(i, i + CHUNK_SIZE));
    }

    await Promise.all(
      parts.map((part, i) => store.setItemAsync(chunkKey(key, i), part))
    );
    await store.setItemAsync(countKey(key), String(parts.length));

    // 前回より短くなった場合、余ったチャンクが残るので消す
    if (previousCount > parts.length) {
      await Promise.all(
        Array.from({ length: previousCount - parts.length }, (_, i) =>
          store.deleteItemAsync(chunkKey(key, parts.length + i))
        )
      );
    }
  },

  async removeItem(key: string): Promise<void> {
    const count = await readCount(key);
    await Promise.all([
      store.deleteItemAsync(countKey(key)),
      ...Array.from({ length: count }, (_, i) =>
        store.deleteItemAsync(chunkKey(key, i))
      ),
    ]);
  },
};
