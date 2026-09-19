/**
 * expo-crypto を足さずに済ませるための簡易 uuid v4。
 *
 * ⚠️ 同じものが app/collect/[storeId].tsx・StoreForm.tsx・StoreImagePicker.tsx にも
 *    べた書きされている。新しく書き足さず、ここから import すること。
 */
export function makeUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
