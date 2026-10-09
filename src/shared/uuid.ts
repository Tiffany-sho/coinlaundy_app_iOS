/**
 * 簡易 uuid v4。
 *
 * expo-crypto を足さずに済ませるためのもの。用途は
 *   - Idempotency-Key（集金の二重登録防止）
 *   - 機種・追加在庫のローカル ID
 * で、いずれも衝突しなければよく暗号強度は要らない。
 *
 * ⚠️ 各ファイルにコピーを持たないこと（かつて 4 か所に同じものがあった）。
 */
export function makeUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
