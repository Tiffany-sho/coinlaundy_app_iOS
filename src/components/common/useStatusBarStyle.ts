import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { setStatusBarStyle, type StatusBarStyle } from "expo-status-bar";

/**
 * アプリの既定。背景がほぼ全画面 `color.appBg`（薄い水色）なので黒文字。
 * ⚠️ `app/_layout.tsx` の `<StatusBar style="dark" />` と揃えること。
 */
const DEFAULT_STYLE: StatusBarStyle = "dark";

/**
 * その画面にいる間だけステータスバーの文字色を変える。
 *
 * ⚠️ **`<StatusBar style="…" />` を直接置かないこと。** expo-status-bar の
 *    `StatusBar` はマウント時に設定するだけで、**アンマウント時に元へ戻さない。**
 *    暗い背景の画面で `light` にすると、そこを離れた後も白文字のまま残り、
 *    薄い水色の背景に白文字が乗って時計も電池も読めなくなる。
 *    ルートの `<StatusBar style="dark" />` は効果が 1 回だけなので戻してくれない。
 *
 * ⚠️ **今は呼び出し元が無い**（唯一の暗い画面だった `app/welcome.tsx` を
 *    2026-08-01 に廃止したため）。**消さないこと。** 上の罠は実際に踏んだもので、
 *    濃色の画面を足した瞬間に再発する。
 *
 * この hook は `useFocusEffect` の後片付けで既定へ戻すので、離れれば必ず黒文字になる。
 * ⚠️ web では `setStatusBarStyle` が no-op（`StatusBar.web.ts`）。呼んでも害は無い。
 */
export function useStatusBarStyle(style: StatusBarStyle) {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style);
      return () => setStatusBarStyle(DEFAULT_STYLE);
    }, [style])
  );
}
