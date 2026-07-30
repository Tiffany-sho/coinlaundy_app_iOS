import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * ソフトウェアキーボードが出ているか。
 *
 * キーボードの上に何かを置く画面で、safe area の余白を足すかどうかの判断に使う。
 * ホームバーはキーボードに覆われるので、出ている間は `insets.bottom` が不要になる
 * （足すとキーボードとの間に隙間が出る）。
 *
 * ⚠️ **iOS は `will` 系、Android は `did` 系を使う。** iOS の `keyboardDidShow` は
 *    アニメーション完了後に来るのでレイアウトが一段遅れて動いて見える。
 *    Android には `will` 系のイベントが無い。
 *
 * ⚠️ **web では常に false。** react-native-web の `Keyboard` は
 *    `addListener()` が `{ remove: () => {} }` を返すだけの no-op で、
 *    `isVisible()` も常に false を返す（`dist/exports/Keyboard/index.js`）。
 *    落ちはしないので分岐は要らない。
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
