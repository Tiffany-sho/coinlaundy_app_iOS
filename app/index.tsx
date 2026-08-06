import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/auth/AuthProvider";
import { useBootstrap } from "@/api/queries";
import { ApiError } from "@/api/client";
import { Button } from "@/components/common/ui";
import { color, font, spacing } from "@/theme/tokens";

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
  const { data, isLoading, isFetching, error, refetch } = useBootstrap(Boolean(session));

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

  /*
    ⚠️ **取得に失敗して手元に何も無いときに、そのままタブへ入れないこと。**
       2026-08-06 まで下の `/(tabs)` が受け皿になっていたため、**通信エラーが
       「組織未所属の空のアプリ」として表示されていた。** 実際にそう見えた:

         こんにちは、集金担当者さん   ← username が undefined（既定文字列）
         組織に所属すると…            ← organization が undefined
         プラン —  / 店舗数 —          ← 同上
         タブがホーム 1 本             ← hasOrg が false 扱い

       **どこにもエラーが出ない**ので、アカウントの問題だと誤解する。
       ⚠️ **審査でも起こり得る。** 審査員が電波の悪い場所で開くと、
          機能が 1 つも無いアプリに見える。

    ⚠️ **`data` があるときは通さない。** 永続キャッシュ（MMKV）から復元した
       応答で普通に起動させたいので、オフライン起動は従来どおり動く。
       ここに来るのは**キャッシュも無く取得も失敗した**ときだけ。
    ⚠️ **UNAUTHENTICATED は上で拾っている**ので、ここへは来ない。
  */
  if (!data && error) return <LoadError onRetry={() => void refetch()} />;

  return <Redirect href="/(tabs)" />;
}

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.appBg }}>
      <ActivityIndicator color={color.teal} size="large" />
    </View>
  );
}

/**
 * 起動時にデータを 1 件も取れなかったときの画面。
 *
 * ⚠️ **サインアウトを必ず置く。** ここへ来た人はタブにも設定にも辿り着けないので、
 *    これが無いと**アプリを消す以外に抜け道が無い。** 端末に残った古いセッションで
 *    詰まった場合の唯一の出口になる。
 * ⚠️ **原因を「通信」と断定しない。** サーバ側の不調でも同じ画面になる。
 */
function LoadError({ onRetry }: { onRetry: () => void }) {
  const { signOut } = useAuth();
  return (
    <View style={styles.errorRoot}>
      <Ionicons name="cloud-offline-outline" size={44} color={color.textFaint} />
      <Text style={styles.errorTitle}>データを読み込めませんでした</Text>
      <Text style={styles.errorNote}>
        通信の状態をご確認のうえ、もう一度お試しください。
      </Text>
      <View style={styles.errorActions}>
        <Button label="再試行" variant="gradient" onPress={onRetry} />
        <Button label="サインアウト" variant="ghost" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.appBg,
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    fontFamily: font.uiBold,
    fontSize: 17,
    color: color.textMain,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  errorNote: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 20,
    color: color.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  /* ⚠️ 幅を持たせる。`alignItems: "center"` の中では中身の幅にしか広がらない */
  errorActions: { gap: spacing.md, marginTop: spacing.xl, alignSelf: "stretch" },
});
