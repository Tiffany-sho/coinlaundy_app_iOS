import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { uploadStoreImage } from "@/api/queries";
import { apiErrorMessage } from "@/components/stores/StoreForm";
import { pickImage } from "@/components/common/pickImage";
import { Muted } from "@/components/common/ui";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";
import type { StoreImage } from "@/api/types";
import { makeUuid } from "@/shared/uuid";

/**
 * 店舗写真の追加・削除。Web の CoinLaundryForm.jsx にある写真の節に当たる。
 *
 * ── 保存の流れ ──
 * 1. ここで選んだ画像を **その場で** Storage にアップロードして { url, path } を得る
 *    （アプリは SUPABASE_SERVICE_KEY を持てないので必ず BFF 経由）
 * 2. 親フォームは images 配列を保持し、店舗の保存時に**まるごと**送る
 * 3. 保存に失敗したら、この画面で足したぶんを Storage から消す（呼び出し側の責務）
 *
 * ⚠️ laundry_store.images は保存のたびに丸ごと置き換わる。
 *    「削除」は配列から外すだけで、Storage の実体を消すのは保存が通ってから。
 *    先に消すと、保存をやめたときに既存の画像だけ失う。
 */

export function StoreImagePicker({
  images,
  onChange,
  onUploaded,
  disabled,
}: {
  images: StoreImage[];
  onChange: (images: StoreImage[]) => void;
  /** 新しく Storage に置けた画像。保存に失敗したときの巻き戻し対象 */
  onUploaded?: (image: StoreImage) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    if (disabled || busy) return;
    setError(null);

    // 形式の判定・HEIC・サイズ上限は共通化してある（components/common/pickImage.ts）
    const result = await pickImage("store-image");
    if (result.status === "canceled") return;
    if (result.status === "error") {
      setError(result.message);
      return;
    }

    // ファイル名は本家と同じ「時刻_uuid.拡張子」。衝突しないので upsert が要らない
    const name = `${Date.now()}_${makeUuid()}.${result.image.ext}`;

    setBusy(true);
    try {
      const uploaded = await uploadStoreImage({
        uri: result.image.uri,
        name,
        type: result.image.type,
        blob: result.image.blob,
      });
      onUploaded?.(uploaded);
      onChange([...images, uploaded]);
    } catch (e) {
      // ⚠️ BFF の日本語をそのまま出す
      setError(apiErrorMessage(e, "画像をアップロードできませんでした"));
    } finally {
      setBusy(false);
    }
  }

  function remove(target: StoreImage) {
    Haptics.selectionAsync().catch(() => {});
    // 配列から外すだけ。Storage の実体は店舗の保存が通ってから消す
    onChange(images.filter((image) => image.url !== target.url));
  }

  return (
    <View>
      {images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {images.map((image) => (
            <View key={image.url} style={styles.thumbWrap}>
              <Image source={{ uri: image.url }} style={styles.thumb} contentFit="cover" />
              {!disabled && (
                <Pressable
                  onPress={() => remove(image)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="この写真を外す"
                  style={({ pressed }) => [styles.thumbRemove, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="close" size={16} color="#FFFFFF" />
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <Pressable
        onPress={() => void pick()}
        disabled={disabled || busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.addButton,
          (disabled || busy) && { opacity: 0.5 },
          pressed && !disabled && !busy && { opacity: 0.8 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={color.teal} />
        ) : (
          <>
            <Ionicons name="image-outline" size={17} color={color.teal} />
            <Text style={styles.addLabel}>写真を追加</Text>
          </>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {images.length === 0 && !error ? (
        <Muted style={styles.hint}>店舗一覧と詳細に出る写真です。1 枚目が代表になります。</Muted>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingBottom: spacing.sm },
  thumbWrap: { width: 96, height: 96 },
  thumb: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: color.divider },
  /**
   * ⚠️ サムネの**内側**に置くこと。以前は top/right を -6 にしてはみ出させていたが、
   *    親が横 ScrollView なので Web では overflow に切り取られ、ボタンの上半分が消えていた。
   *    外に出す限りどのプラットフォームでも同じ事故が起きる。
   */
  thumbRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: HIT_SIZE,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.cyan300,
  },
  addLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
  error: { fontFamily: font.ui, fontSize: 12, color: color.red500, marginTop: spacing.sm },
  hint: { fontSize: 11, marginTop: spacing.sm },
});
