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
      }}
    />
  );
}
