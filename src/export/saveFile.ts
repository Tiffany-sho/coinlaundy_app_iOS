import { Platform, Share } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

/**
 * BFF から受け取った base64 を端末のファイルにして、共有シートに渡す。
 *
 * ⚠️ **iOS に「ダウンロードフォルダ」は無い。** Web のようにファイルを置いて
 *    終わりにはできないので、書き出したあと必ず共有シート（UIActivityViewController）を
 *    開く。ユーザーはそこから「"ファイル"に保存」「メールで送信」などを選ぶ。
 *
 * ⚠️ **保存先は cache。** document に置くと iCloud バックアップの対象になり、
 *    共有し終わった一時ファイルが端末とバックアップに残り続ける。
 *
 * ⚠️ **`expo-sharing` は使っていない。** 追加すると EAS の再ビルドが要るが、
 *    やることは共有シートを開くだけで RN 標準の `Share` で足りる。
 *    `expo-file-system` は `expo` 本体が既に依存しているので、直接依存に
 *    上げても**ネイティブの構成は変わらない**（＝再ビルド不要）。
 */

export type SaveResult = "shared" | "dismissed";

/**
 * 拡張子に対応する MIME。
 * ⚠️ ここが違うと「ファイル」アプリが種類を判別できず、Excel が開けないファイルになる。
 */
export const EXPORT_MIME_TYPE = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

/** 書き出したファイルを置く場所。名前が同じでも毎回上書きしてよい */
const EXPORT_DIR = "exports";

export async function saveAndShareBase64(
  filename: string,
  base64: string,
  mimeType: string
): Promise<SaveResult> {
  if (Platform.OS === "web") return saveOnWeb(filename, base64, mimeType);

  const dir = new Directory(Paths.cache, EXPORT_DIR);
  if (!dir.exists) dir.create({ intermediates: true });

  const file = new File(dir, filename);
  // ⚠️ 同名が残っていると create が投げる。overwrite を付けて必ず作り直す
  file.create({ overwrite: true, intermediates: true });
  file.write(base64, { encoding: "base64" });

  /**
   * ⚠️ **`message` を一緒に渡さない。** iOS では message と url の両方を載せると、
   *    受け取り側のアプリがテキストだけを拾ってファイルを落とすことがある。
   */
  const result = await Share.share({ url: file.uri });
  return result.action === Share.dismissedAction ? "dismissed" : "shared";
}

/**
 * ブラウザ確認用。`<a download>` で普通にダウンロードさせる。
 * ⚠️ expo-file-system の Web 実装は OPFS（ブラウザの中の仮想 FS）なので、
 *    書き出してもユーザーからは取り出せない。web だけ別経路にしてある。
 */
function saveOnWeb(filename: string, base64: string, mimeType: string): SaveResult {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return "shared";
}
