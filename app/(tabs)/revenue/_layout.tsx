import { Stack } from "expo-router";
import { color } from "@/theme/tokens";

/**
 * 収益タブの中に置く Stack。
 *
 * 経費（`revenue/expenses/`）を収益と同じタブに入れるために足した。設定配下ではなく
 * ここに置くのは、経費が「設定」ではなく**日常の記録**だから。
 *
 * ⚠️ **`app/(tabs)/revenue.tsx` と共存できない。** 単体ファイルはディレクトリ化と
 *    同時に消してある（`stores` のときと同じ）。
 */
export const unstable_settings = {
  // /revenue/expenses へ直接来たときも、戻る先が収益になるようにする
  anchor: "index",
};

export default function RevenueLayout() {
  return (
    <Stack
      screenOptions={{
        // 各画面が自前のヘッダーを持っている
        headerShown: false,
        contentStyle: { backgroundColor: color.appBg },
        /* ⚠️ ルートの Stack の screenOptions は**入れ子の Stack には降りてこない。**
              ここにも書かないと、このタブの中だけ遷移が無アニメーションになる */
        animation: "slide_from_right",
        /*
          戻るジェスチャを**画面の左端だけ**にする。

          ⚠️ **これを外すと期間の送りが全部「前の画面へ戻る」に化ける。**
             iOS 26 以降は `fullScreenGestureEnabled` の既定が **true**（画面全体）で、
             収益ページには横に払って期間を送る `ChartPager` が**月別売上**に入っている。
          ⚠️ **1 枚しか無いことを理由に消さないこと。** 期間の送りが 1 か所でも
             奪われれば同じことで、`ChartPager` を持つカードは今後も増える
             （店舗別の収益ページの機器別がそう。あちらは `stores/_layout.tsx` が塞ぐ）。
          ⚠️ **これまで露出していなかったのは偶然。** 収益がタブの葉で、
             ルートの `<Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />`
             （ログイン直後のスワイプ対策）に守られていただけ。
             **Stack にした時点で自前で塞ぐ必要が出た。**
          ⚠️ **iOS 18 以下では既定が false** なので、この 1 行は効果を持たない。
             **「手元で再現しない」を理由に消さないこと。**
          ⚠️ `gestureEnabled: false` にはしないこと（戻る操作そのものが消える）。
        */
        fullScreenGestureEnabled: false,
      }}
    />
  );
}
