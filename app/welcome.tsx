import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/common/ui";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 未ログインの起点。**ログインと新規登録のどちらへも行ける**（2026-08-06）。
 *
 * ⚠️ **2026-08-01 に一度廃止した `/welcome` を作り直したもの。**
 *    あのときの版は Netflix 型の紹介 3 枚 + 濃色の背景で、決め手は
 *    **背景のコラージュ 6 枚が差し替え前提のモック画像のままだった**こと。
 *    ⚠️ **あの作りに戻さない。** ここは紹介のための画面ではなく、
 *    **入口を 2 つに分けるためだけ**の 1 枚。画像を 1 枚も使わない。
 *
 * ⚠️ **純白の紙。**（`auth/AuthScreen` と同じ扱い）
 *    - **濃色の面を作らない。** `AuthBackground` / `onDark.*` /
 *      `Button variant="light"` は 2026-08-01 に消してある。**戻さない**
 *    - **teal / cyan を面で使わない。** 使ってよいのは主ボタン
 *      （`variant="gradient"`）と、特徴の行に置く**線と点だけ**
 *    - ⚠️ 背景に `color.cardBg`（純白）を明示する。ルートの Stack の
 *      `contentStyle` が `appBg`（薄い水色）なので、省くと透ける
 *
 * ⚠️ **ここに料金・プラン名・外部サイトでの契約への言及を書かない**
 *    （Guideline 3.1.3(a) / 3.1.2）。**未ログインで最初に出る画面**なので
 *    審査員が必ず見る。特徴は「何ができるか」だけに留めること。
 *
 * ⚠️ **サインアウトの着地点でもある。** 参照は 6 か所（起動時の振り分け ×2 /
 *    設定のサインアウト / アカウント削除 / 組織を抜けたとき / 初期設定の中断）。
 *    **入口だけ直すと残りがログイン画面に落ちる**ので、増減させたら
 *    `grep -rn '"/welcome"' app/ src/` で数を確かめること。
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.head}>
          <Text style={styles.logo}>Collecie</Text>
          <Text style={styles.tagline}>コインランドリーの集金を、その場で記録する</Text>
        </View>

        {/* ⚠️ 3 つに留める。ここは説明の画面ではないので、増やすとボタンが下へ押し出される */}
        <View style={styles.features}>
          <Feature icon="cash-outline" text="集金の記録と売上の集計" />
          <Feature icon="cube-outline" text="在庫と設備の状態を全員で共有" />
          <Feature icon="pie-chart-outline" text="経費を入れて月ごとの利益を見る" />
        </View>

        {/*
          ⚠️ **新規登録を主ボタンにする。** この画面に来る人の多くは
             インストール直後で、既存ユーザーはログインを探せる。
          ⚠️ **`replace` ではなく `push`。** 戻ってこの画面を選び直せるようにする
             （`AuthScreen` の「戻る」がその戻り先）。
        */}
        <View style={styles.actions}>
          <Button
            label="新規登録"
            variant="gradient"
            onPress={() => router.push("/signup")}
          />
          <Button label="ログイン" variant="ghost" onPress={() => router.push("/login")} />
        </View>
      </ScrollView>
    </View>
  );
}

function Feature({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
}) {
  return (
    <View style={styles.feature}>
      <Ionicons name={icon} size={18} color={color.teal} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ⚠️ appBg（#F0F9FF）ではなく純白。理由は上の注意 */
  root: { flex: 1, backgroundColor: color.cardBg },
  /* ⚠️ `justifyContent: "center"` にしない。小さい端末で特徴が上へ潜る */
  body: { flexGrow: 1, paddingHorizontal: spacing.xl },
  head: { alignItems: "center" },
  logo: {
    fontFamily: font.uiBold,
    fontSize: 34,
    color: color.tealDeeper,
    letterSpacing: 0.5,
  },
  tagline: {
    fontFamily: font.ui,
    fontSize: 14,
    lineHeight: 22,
    color: color.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
  /* ⚠️ ボタンを下端に寄せる（`marginTop: "auto"`）。特徴とボタンが
        くっつくと、特徴の 4 行目のように見える */
  features: { gap: spacing.lg, marginTop: spacing.xxl },
  feature: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  featureText: { fontFamily: font.ui, fontSize: 14, color: color.textMain, flex: 1 },
  actions: { gap: spacing.md, marginTop: "auto", paddingTop: spacing.xxl },
});
