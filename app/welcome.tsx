import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button } from "@/components/common/ui";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 未ログインの起点。**ログインと新規登録のどちらへも行ける**（2026-08-06）。
 *
 * ⚠️ **2026-08-01 に廃止した `/welcome` を作り直したもの。**
 *    あのときの版は Netflix 型の紹介 3 枚 + 濃色の背景で、決め手は
 *    **背景のコラージュ 6 枚が差し替え前提のモック画像のまま**だったこと。
 *    ⚠️ **あの作りに戻さない。** ここは紹介のための画面ではなく、
 *    **入口を 2 つに分けるためだけ**の 1 枚。
 *
 * ⚠️ **置くのは「名前・ひとこと・ボタン 2 つ」だけ**（2026-08-06 の指示）。
 *    一度は特徴を 3 行入れていたが外した。**画像も、機能の列挙も足さないこと。**
 *    増やすほどボタンが下へ押し出され、**入口を選ぶだけの画面**でなくなる。
 *
 * ⚠️ **純白の紙。**（`auth/AuthScreen` と同じ扱い）
 *    - **濃色の面を作らない。** `AuthBackground` / `onDark.*` /
 *      `Button variant="light"` は 2026-08-01 に消してある。**戻さない**
 *    - **teal / cyan を面で使わない。** 使ってよいのは主ボタン（`variant="gradient"`）だけ
 *    - ⚠️ 背景に `color.cardBg`（純白）を明示する。ルートの Stack の
 *      `contentStyle` が `appBg`（薄い水色）なので、省くと透ける
 *
 * ⚠️ **ここに料金・プラン名・外部サイトでの契約への言及を書かない**
 *    （Guideline 3.1.3(a) / 3.1.2）。**未ログインで最初に出る画面**なので
 *    審査員が必ず見る。
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
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <Text style={styles.logo}>Collecie</Text>
        <Text style={styles.tagline}>コインランドリーの集金を、その場で記録する</Text>

        {/*
          ⚠️ **新規登録を主ボタンにする。** この画面に来る人の多くは
             インストール直後で、既存ユーザーはログインを探せる。
          ⚠️ **`replace` ではなく `push`。** 戻ってこの画面を選び直せるようにする
             （`AuthScreen` の「戻る」がその戻り先）。
        */}
        <View style={styles.actions}>
          <Button label="新規登録" variant="gradient" onPress={() => router.push("/signup")} />
          <Button label="ログイン" variant="ghost" onPress={() => router.push("/login")} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ⚠️ appBg（#F0F9FF）ではなく純白。理由は上の注意 */
  root: { flex: 1, backgroundColor: color.cardBg },
  /*
    ⚠️ **画面の中央に寄せる**（`justifyContent: "center"`、2026-08-06 の指示）。
       中身が「名前・ひとこと・ボタン 2 つ」だけなので、上に詰めると
       画面の下 2/3 が空く。**中身を増やすならこの寄せ方を見直すこと**
       （小さい端末で上へ潜る）。
  */
  body: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.xl },
  logo: {
    fontFamily: font.uiBold,
    fontSize: 34,
    color: color.tealDeeper,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  tagline: {
    fontFamily: font.ui,
    fontSize: 14,
    lineHeight: 22,
    color: color.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
  actions: { gap: spacing.md, marginTop: spacing.xxl },
});
