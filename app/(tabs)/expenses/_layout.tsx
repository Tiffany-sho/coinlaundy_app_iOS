import { Stack } from "expo-router";
import { color } from "@/theme/tokens";

/**
 * 経費タブの中に置く Stack（一覧 → 追加 / 編集）。
 *
 * 2026-08-03 に**収益タブの中から独立したタブへ移した**（それまでは
 * `revenue/expenses/`）。経費は毎日触る記録で、収益グラフの奥に 2 タップ
 * 置くと入力の頻度が落ちるため。
 *
 * ⚠️ **`/revenue/expenses` へ戻さないこと。** 戻すと入口が 2 つになるか、
 *    タブと重複した同じ画面を 2 か所に置くことになる。
 */
export const unstable_settings = {
  // 追加・編集へ直接来たときも、戻る先が一覧になるようにする
  anchor: "index",
};

export default function ExpensesLayout() {
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

          ⚠️ **これを外すと月の送りが全部「前の画面へ戻る」に化ける。**
             iOS 26 以降は `fullScreenGestureEnabled` の既定が **true**（画面全体）で、
             経費の一覧は月を横に払って送る（`ChartPager`）。
          ⚠️ **iOS 18 以下では既定が false** なので、この 1 行は効果を持たない。
             **「手元で再現しない」を理由に消さないこと。**
          ⚠️ `gestureEnabled: false` にはしないこと（戻る操作そのものが消える）。
        */
        fullScreenGestureEnabled: false,
      }}
    />
  );
}
