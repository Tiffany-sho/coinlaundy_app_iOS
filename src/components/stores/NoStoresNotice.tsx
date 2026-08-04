import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Muted } from "@/components/common/ui";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 店舗が 1 件も無いときに出す案内。**店舗の登録へ誘導する。**
 *
 * 店舗が無いとホーム・収益・管理がすべて空になり、**何をすれば埋まるのかが
 * どこにも書かれていなかった**（2026-08-05）。同じ文面を 4 画面に散らすと
 * ずれるので 1 か所にまとめてある。
 *
 * ⚠️ **「登録する」ボタンは admin にしか出さない。** 店舗の作成は
 *    `createStore` が `myRole !== "admin"` を弾くので、出すと**押しても
 *    403 になるボタン**になる。
 *
 * ⚠️ **「店舗が 0 件」と「担当店舗（011）が 0 件」はアプリから区別できない。**
 *    `getStores()` は担当ぶんしか返さないため、どちらも空配列で返る。
 *    管理者は常に全店舗なので、**非管理者のときは担当の割り当てを疑うほうが当たる。**
 *    ここを「店舗がありません」だけにすると、集金担当者は**組織ごと空だと思って
 *    管理者に連絡しない**（`docs/contracts.md` の「担当店舗」）。
 */
export function NoStoresNotice({
  isAdmin,
  /**
   * 目立たせるか。ホームでは最初に目に入ってほしいので `true`。
   * ⚠️ 一覧の中で使うときは `false`。全部を強調すると強調にならない。
   */
  prominent = false,
  style,
}: {
  isAdmin: boolean;
  prominent?: boolean;
  style?: React.ComponentProps<typeof Card>["style"];
}) {
  const router = useRouter();

  return (
    <Card style={[prominent && styles.prominent, style]}>
      <View style={styles.head}>
        <View style={[styles.icon, prominent && { backgroundColor: color.teal }]}>
          <Ionicons
            name={isAdmin ? "storefront-outline" : "person-outline"}
            size={18}
            color={prominent ? "#FFFFFF" : color.teal}
          />
        </View>
        <Text style={styles.title}>
          {isAdmin ? "まず店舗を登録しましょう" : "担当する店舗がありません"}
        </Text>
      </View>

      <Muted style={styles.body}>
        {isAdmin
          ? "店舗を登録すると、集金の記録・売上のグラフ・在庫の管理が使えるようになります。"
          : "担当する店舗は店舗管理者が割り当てます。心当たりがなければ管理者にご確認ください。"}
      </Muted>

      {/* ⚠️ 非管理者には出さない（サーバが 403 を返すため） */}
      {isAdmin && (
        <Button
          label="店舗を登録する"
          icon="add"
          variant={prominent ? "gradient" : "primary"}
          onPress={() => router.push("/stores/new")}
          style={{ marginTop: spacing.lg }}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  /* ⚠️ 面を teal で塗らない。使ってよいのは線と点だけ（CLAUDE.md の「見た目の決めごと」） */
  prominent: { borderWidth: 1.5, borderColor: color.cyan200 },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: {
    backgroundColor: color.cyan100,
    borderRadius: radius.pill,
    padding: 7,
  },
  title: { flex: 1, fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
  body: { marginTop: spacing.sm, fontSize: 13, lineHeight: 19 },
});
