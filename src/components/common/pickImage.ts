import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

/**
 * 写真を 1 枚選ぶ。店舗写真とアカウントのアイコンで共用する。
 *
 * ⚠️ **ここに集めてある知識をコピーしないこと。** 形式の判定と HEIC の扱いは
 *    実機で踏んで初めて分かったもので（`docs/traps.md` の expo-image-picker を参照）、
 *    2 か所に持つと片方だけ直して「iPhone で撮った写真だけ登録できない」に戻る。
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
 * アップロードできる上限。`docs/contracts.md` に載せている 10MB に揃えてある。
 *
 * ⚠️ **実体は BFF を通らない**（署名付き URL で Storage へ直接送る）。以前は Vercel の
 *    サーバーレス関数の 4.5MB 上限に当たり、しかも拒否がアップロード途中の接続切断として
 *    現れるため「通信できませんでした」という無関係な文言しか出なかった。
 *    いま効いているのは Storage のバケット設定だけなので、ここは早めに気づかせるための保険。
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type PickedImage = {
  uri: string;
  /** "jpg" | "png"。保存するファイル名の拡張子に使う */
  ext: string;
  /** 正規化済みの content-type。⚠️ 端末が返す "image/jpg" は BFF が弾くので必ずこれを使う */
  type: string;
  /**
   * ⚠️ ブラウザで確認するときは必須。web の uri は `blob:http://…` で、
   *    fetch で読み直すより expo-image-picker が返す asset.file をそのまま
   *    body にしたほうが確実。
   */
  blob?: Blob;
};

export type PickImageResult =
  | { status: "picked"; image: PickedImage }
  /** ユーザーが自分でやめた。何も出さない */
  | { status: "canceled" }
  /** 許可されていない・形式が違う・大きすぎる。message はそのまま画面に出せる日本語 */
  | { status: "error"; message: string };

/**
 * @param logTag console に出す接頭辞。実機で「通信できませんでした」が出たとき、
 *   まず選んだ画像の形式とサイズを見たいので残してある
 */
export async function pickImage(logTag: string): Promise<PickImageResult> {
  Haptics.selectionAsync().catch(() => {});

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      status: "error",
      message: "写真へのアクセスが許可されていません。設定から許可してください。",
    };
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
  if (picked.canceled || picked.assets.length === 0) return { status: "canceled" };

  const asset = picked.assets[0];
  const mime = resolveMime(asset);

  console.log(
    `[${logTag}] mime=${mime} size=${asset.fileSize ?? "?"}B ` +
      `${asset.width}x${asset.height} uri=${asset.uri.slice(0, 60)}`
  );

  const ext = mime ? ALLOWED_MIME[mime] : undefined;
  if (!ext) {
    return {
      status: "error",
      message:
        mime === "image/heic" || mime === "image/heif"
          ? "この写真は HEIC 形式のため登録できません。JPEG で保存し直してから選んでください。"
          : "jpeg または png の画像を選んでください",
    };
  }

  const size = asset.fileSize ?? 0;
  if (size > MAX_UPLOAD_BYTES) {
    return {
      status: "error",
      message:
        `画像のサイズが大きすぎます（${(size / 1024 / 1024).toFixed(1)}MB）。` +
        `10MB 以下の画像を選んでください。`,
    };
  }

  return {
    status: "picked",
    image: { uri: asset.uri, ext, type: EXT_TO_MIME[ext], blob: asset.file },
  };
}

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
