import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { pickImage } from "@/components/common/pickImage";
import { useToast } from "@/components/common/toast";
import { useUploadAvatar } from "@/api/queries";
import { apiErrorMessage } from "@/components/stores/StoreForm";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * アカウントのアイコン。Web の AccountEditForm の AvatarUploader に当たる。
 *
 * ⚠️ **アイコンだけは「更新する」を待たずにその場で保存される。** Web も同じ挙動。
 *    Storage に置いた時点で前のファイルが上書きされてしまい（パスが user.id で固定）、
 *    取り消せないため、フォームの下書きとして持つ意味が無い。
 *    ボタンを押さないと保存されない氏名・表示名とは扱いが違うので、
 *    説明文でそれが分かるようにしてある。
 */
export function AvatarPicker({
  avatarUrl,
  username,
}: {
  avatarUrl: string | null | undefined;
  /** 画像が無いときに出す頭文字 */
  username: string | null | undefined;
}) {
  const toast = useToast();
  const upload = useUploadAvatar();

  const initial = (username ?? "?").charAt(0).toUpperCase();

  async function onPress() {
    if (upload.isPending) return;

    const result = await pickImage("avatar");
    if (result.status === "canceled") return;
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }

    try {
      await upload.mutateAsync({
        uri: result.image.uri,
        type: result.image.type,
        blob: result.image.blob,
      });
      toast.success("アイコンを更新しました");
    } catch (e) {
      // ⚠️ BFF / Storage の日本語をそのまま出す
      toast.error(apiErrorMessage(e, "アイコンを更新できませんでした"));
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => void onPress()}
        disabled={upload.isPending}
        accessibilityRole="button"
        accessibilityLabel="アイコンを変更"
        style={({ pressed }) => [styles.avatarTap, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.avatar}>
          {upload.isPending ? (
            <ActivityIndicator color={color.teal} />
          ) : avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <Text style={styles.initial}>{initial}</Text>
          )}
        </View>
        {/* カメラの丸。⚠️ avatar の外に出すと overflow: hidden で切られるので中に置く */}
        <View style={styles.badge}>
          <Ionicons name="camera" size={12} color="#FFFFFF" />
        </View>
      </Pressable>
      <Text style={styles.hint}>タップして写真を変更（すぐに保存されます）</Text>
    </View>
  );
}

const AVATAR_SIZE = 88;

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.sm },
  /* バッジを内側に収めるため、押せる範囲は円より少し大きく取る */
  avatarTap: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: color.cyan200,
    backgroundColor: color.tealPale,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontFamily: font.uiBold, fontSize: 30, color: color.tealDeeper },
  badge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: color.teal,
    borderWidth: 2,
    borderColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { fontFamily: font.ui, fontSize: 11, color: color.textMuted },
});
