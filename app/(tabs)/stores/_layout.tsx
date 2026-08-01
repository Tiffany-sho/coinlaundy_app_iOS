import { Stack } from "expo-router";
import { color } from "@/theme/tokens";

/**
 * 店舗タブの中に置く Stack。
 *
 * 店舗詳細・店舗別の集金履歴はもともと app/stores/[id]/ にあったが、
 * タブバーは (tabs) グループ配下の画面にしか出ないので、店舗一覧から詳細へ進むと
 * フッターが消えていた。タブの中に Stack を入れ子にすることで、
 * 詳細へ push してもタブバーが出たままになる。
 *
 * (tabs) は URL に出ないグループなので、この移動でも
 * /stores・/stores/:id・/stores/:id/funds はそのまま。ディープリンクも変わらない。
 */
export const unstable_settings = {
  // /stores/:id へ直接ディープリンクで入ってきたときも、戻る先が店舗一覧になるようにする
  anchor: "index",
};

export default function StoresLayout() {
  return (
    <Stack
      screenOptions={{
        // 各画面が自前のヘッダー（詳細は画像に重ねた戻るボタン、履歴は独自バー）を持っている
        headerShown: false,
        contentStyle: { backgroundColor: color.appBg },
        /* ⚠️ ルートの Stack の screenOptions は**入れ子の Stack には降りてこない。**
              ここにも書かないと、タブの中だけ遷移が無アニメーションになる */
        animation: "slide_from_right",
        /*
          戻るジェスチャを**画面の左端だけ**にする。

          ⚠️ **iOS 26 以降はこれが既定で true（画面全体）になった。**
             そのままだと画面のどこを横に払っても前の画面へ戻るので、
             **この Stack にある横方向の操作が全部使えなくなる**:
               - 店舗詳細 … 画像のカルーセル
               - 店舗別の収益 … 期間を送るページャ（ChartPager）
               - 追加 / 編集 … 画像ピッカー
             実際に「店舗別のグラフをスワイプすると前の画面に戻る」形で踏んだ。
          ⚠️ **iOS 18 以下では既定が false** なので、この 1 行は効果を持たない
             （＝古い端末では最初から起きていない）。**「手元で再現しない」を
             理由に消さないこと。**
          ⚠️ 戻る操作自体は残る（左端から払う / 各画面の戻るボタン）。
             `gestureEnabled: false` にはしないこと。
        */
        fullScreenGestureEnabled: false,
      }}
    />
  );
}
