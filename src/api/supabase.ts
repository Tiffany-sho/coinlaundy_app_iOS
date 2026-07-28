import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { LargeSecureStore } from "./secureStorage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を .env.local に設定してください"
  );
}

/**
 * Supabase は「認証のみ」に使う。DB クエリは必ず BFF（/api/v1）経由。
 * ここから .from() を呼ぶコードを書かないこと。
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: LargeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // RN では必ず false
  },
});

/**
 * バックグラウンドでの無駄なトークンリフレッシュを止める。
 * 副作用があるのでアプリ起動時に 1 回だけ呼ぶ。
 */
export function startSessionAutoRefresh() {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });

  if (AppState.currentState === "active") {
    supabase.auth.startAutoRefresh();
  }

  return () => {
    subscription.remove();
    supabase.auth.stopAutoRefresh();
  };
}
