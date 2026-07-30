import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { uploadStoreImage } from "@/api/queries";
import { apiErrorMessage } from "@/components/stores/StoreForm";
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

/** Web の useStoreSubmit.js と同じ制限。値は保存するファイル名の拡張子 */
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

/** mimeType を返さない環境向けの保険。ファイル名の末尾から引く */
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/**
 * アップロードできる上限。
 *
 * ⚠️ **BFF の 10MB ではなくこちらが実際の壁。** Vercel のサーバーレス関数は
 *    リクエストボディが 4.5MB を超えると**関数に届く前に**弾く
 *    （FUNCTION_PAYLOAD_TOO_LARGE）。アップロード途中で接続を切られるので、
 *    端末側では fetch の例外になり「通信できませんでした」しか出ず、
 *    電波のせいだと誤解する。BFF 側の 10MB チェックはここより後なので
 *    **一度も到達しない。**
 *    iPhone の写真は quality 0.8 でも 2〜5MB になるので現実的に踏む。
 *    multipart のヘッダぶんの余裕を見て 4MB にしてある。
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * 選んだ画像の形式を決める。
 *
 * ⚠️ URI の拡張子から取ってはいけない。
 *    - ブラウザの uri は `blob:http://…/uuid` で**拡張子が無い**（expo-image-picker の
 *      ExponentImagePicker.web.ts が URL.createObjectURL を返す）。末尾を切り出すと
 *      URI 全体が「拡張子」になり、jpeg を選んでも弾かれる
 *    - Android の uri は `content://…` でこれも拡張子が無い
 *    mimeType はどのプラットフォームでも入るので、まずそれを見る。
 */
function resolveMime(asset: ImagePicker.ImagePickerAsset): string | null {
  const fromAsset = asset.mimeType ?? asset.file?.type;
  if (fromAsset) return fromAsset.toLowerCase();
  const name = asset.fileName ?? "";
  const ext = name.split("?")[0].split(".").pop()?.toLowerCase();
  return ext ? (EXT_TO_MIME[ext] ?? null) : null;
}

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
    Haptics.selectionAsync().catch(() => {});
    setError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("写真へのアクセスが許可されていません。設定から許可してください。");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      /**
       * ⚠️ iPhone で撮った写真は既定で HEIC。これを付けないと PHPicker が HEIC のまま渡してきて
       *    （expo-image-picker の ImageUtils.swift が `case UTType.heic: return (rawData, ".heic")`）、
       *    jpeg/png 判定で弾かれる。ブラウザは HEIC を表示できないので通すわけにもいかない。
       *    Compatible にすると PHPicker 側が JPEG に変換して渡してくれる。
       */
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (picked.canceled || picked.assets.length === 0) return;

    const asset = picked.assets[0];
    const mime = resolveMime(asset);

    // 切り分け用。実機で「通信できませんでした」が出たときはまずこの行を見る
    console.log(
      `[store-image] mime=${mime} size=${asset.fileSize ?? "?"}B ` +
        `${asset.width}x${asset.height} uri=${asset.uri.slice(0, 60)}`
    );

    const ext = mime ? ALLOWED_MIME[mime] : undefined;
    if (!ext) {
      setError(
        mime === "image/heic" || mime === "image/heif"
          ? "この写真は HEIC 形式のため登録できません。JPEG で保存し直してから選んでください。"
          : "jpeg または png の画像を選んでください"
      );
      return;
    }

    // ⚠️ 上限は BFF ではなくゲートウェイ側で決まる（MAX_UPLOAD_BYTES のコメント参照）。
    //    ここで止めないと「通信できませんでした」という無関係な文言になる
    const size = asset.fileSize ?? 0;
    if (size > MAX_UPLOAD_BYTES) {
      setError(
        `画像のサイズが大きすぎます（${(size / 1024 / 1024).toFixed(1)}MB）。` +
          `4MB 以下の画像を選んでください。`
      );
      return;
    }

    // ファイル名は本家と同じ「時刻_uuid.拡張子」。衝突しないので upsert が要らない
    const name = `${Date.now()}_${makeUuid()}.${ext}`;

    setBusy(true);
    try {
      const uploaded = await uploadStoreImage({
        uri: asset.uri,
        name,
        // ⚠️ BFF は part の Content-Type を "image/jpeg" / "image/png" と厳密に比較する。
        //    端末が返す "image/jpg" をそのまま送ると同じエラー文で弾かれるので正規化する
        type: EXT_TO_MIME[ext],
        // web はここが無いと "[object Object]" が送られる（queries.ts のコメント参照）
        blob: asset.file,
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
