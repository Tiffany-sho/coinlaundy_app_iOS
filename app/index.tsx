import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { useBootstrap } from "@/api/queries";
import { ApiError } from "@/api/client";
import { color } from "@/theme/tokens";

/**
 * 起動時の振り分け。設計図 5 章の起動時フローと 1 対 1 で対応させる。
 *
 *   セッションなし            → /welcome（ログインと新規登録の入口）
 *   profiles 未登録          → 初回セットアップ
 *   組織未所属               → 組織参加
 *   それ以外                 → ホームタブ
 *
 * オフラインでも永続キャッシュに bootstrap があればそのまま起動させる
 * （PersistQueryClientProvider が復元済みのため useBootstrap が即座に data を返す）。
 */
export default function Index() {
  const { session, isRestoring } = useAuth();
  const { data, isLoading, isFetching, error } = useBootstrap(Boolean(session));

  if (isRestoring) return <Splash />;
  /* ⚠️ **`/login` へ直行させないこと**（2026-08-06 に `/welcome` へ戻した）。
        2026-08-01〜08-05 はログイン画面が起点だったが、**インストール直後の人が
        最初に見るのが素のログイン壁**になり、新規登録がフォームの下の
        小さなリンク 1 本にしか無かった。⚠️ **ここは 6 か所ある着地点の 1 つ**
        （`app/welcome.tsx` の注意を参照）*/
  if (!session) return <Redirect href="/welcome" />;

  // キャッシュがあれば data が入っているので待たされない
  if (isLoading && !data) return <Splash />;

  // セッション切れ。AuthProvider 側でも検知するが念のため
  if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
    return <Redirect href="/welcome" />;
  }

  /**
   * ⚠️ 「未登録」の判定だけは取得中なら結果を待つ。
   *    永続キャッシュには初回セットアップ前の { profile: null } が残っていることがあり、
   *    それを信じると設定を終えた直後に /setup へ差し戻してしまう。
   *    設定済みのユーザーは下の 2 つを素通りするので、オフライン起動は従来どおり待たされない。
   */
  if (isFetching && data && (!data.profile || !data.organization)) return <Splash />;

  if (data && !data.profile) return <Redirect href="/setup" />;
  if (data && !data.organization) return <Redirect href="/join-organization" />;

  return <Redirect href="/(tabs)" />;
}

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.appBg }}>
      <ActivityIndicator color={color.teal} size="large" />
    </View>
  );
}
