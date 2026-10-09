import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Title } from "@/components/common/ui";
import { color, spacing } from "@/theme/tokens";

/**
 * 設定への歯車。**各タブの先頭画面の右上に置く**（2026-08-03）。
 *
 * ⚠️ **行き先をここだけが知っている。** 5 画面が `router.push("/settings")` を
 *    それぞれ書くと、1 か所だけ別のパスに直されても型では気づけない。
 *    **呼び出し側にパスを持たせないこと。**
 *
 * ⚠️ **これがアプリで唯一の設定への入口。** 設定はタブから外してあり、
 *    **サインアウト・組織への参加・プラン・通知**がすべてその奥にある。
 *    ⚠️ どの画面からも消さないこと。
 *
 * ⚠️ **組織未所属でも出す。** そのときはタブがホーム 1 本だけで、
 *    **組織に参加する導線が設定の中にしかない。**
 */
export function SettingsButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push("/settings")}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="設定"
      style={({ pressed }) => [styles.button, style, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="settings-outline" size={22} color={color.tealDeeper} />
    </Pressable>
  );
}

/**
 * 画面の見出し + 右上の歯車。
 *
 * ⚠️ **タブの先頭画面にだけ置く。** 詳細画面や入力画面には出さない
 *    （あちらは戻る・保存・削除など固有の操作を持っており、
 *    そこへ設定を混ぜると押し間違える）。
 *
 * ⚠️ **見出しは 22px で揃える。** 画面ごとに変えると、タブを切り替えたときに
 *    見出しの大きさが跳ねる。
 */
export function ScreenTitleRow({
  title,
  style,
}: {
  title: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      <Title style={{ fontSize: 22 }}>{title}</Title>
      <SettingsButton />
    </View>
  );
}

const styles = StyleSheet.create({
  /* ⚠️ 44x44 を確保する。アイコンだけだと指で押しにくい */
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    /* 右端の余白を食わないよう外側へはみ出させる（見出しと縦位置を揃えるため） */
    marginRight: -10,
    marginVertical: -10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
});
