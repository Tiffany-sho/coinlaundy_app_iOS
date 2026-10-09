import { Stack } from "expo-router";
import { color } from "@/theme/tokens";

/**
 * 管理タブの中に置く Stack。
 *
 * 在庫の設定（種類の追加・削除、警告ライン）は編集シートに同居させると縦に長くなるので、
 * /manage/:laundryId として別画面にした。タブバーを残したいので、
 * app/ 直下ではなくタブの中に Stack を入れ子にしている（app/(tabs)/stores/ と同じ理由）。
 *
 * ⚠️ app/(tabs)/manage.tsx と app/(tabs)/manage/ は共存できない。
 *    単体ファイルは manage/index.tsx へ移してある。
 */
export const unstable_settings = {
  // /manage/:laundryId へ直接入ってきたときも、戻る先が一覧になるようにする
  anchor: "index",
};

export default function ManageLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.appBg },
        /* ⚠️ ルートの Stack の screenOptions は入れ子の Stack には降りてこない */
        animation: "slide_from_right",
      }}
    />
  );
}
