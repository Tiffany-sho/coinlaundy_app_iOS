import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { useDialog } from "@/components/common/dialog";
import {
  getPermission,
  hasBeenPrimed,
  hasRegisteredCollect,
  isPushSupported,
  markPrimed,
  requestPermission,
  syncPushToken,
} from "@/push/pushToken";

/**
 * 通知許可のプライミング。ホーム画面から 1 回だけ呼ぶ。
 *
 * ⚠️ **起動直後に OS のダイアログを出さない。** 何のための通知か分からない
 *    段階で聞くと拒否率が跳ね上がり、**一度拒否されるとアプリからは二度と
 *    ダイアログを出せない**（設定アプリへ誘導するしかなくなる）。
 *    初回の集金登録を終えた人にだけ、用途を説明してから聞く（設計図 10.3）。
 *
 * ⚠️ 集金モーダルの中で出さないこと。iOS は Modal の上に Modal を重ねられないので、
 *    モーダルを閉じてホームに戻ってから出す。
 *
 * ⚠️ **`useEffect` で書いてはいけない。** 集金モーダルは
 *    `presentation: "fullScreenModal"` で root Stack の上に載るだけなので、
 *    **ホームはアンマウントされない。** マウント時に一度走った `useEffect` は
 *    「まだ集金していない」で早期 return したまま二度と再評価されず、
 *    登録を終えて戻ってきても何も出ない（次回起動まで出ない）。
 *    画面が再びフォーカスされたときに走る `useFocusEffect` を使う。
 */
export function usePushPriming() {
  const dialog = useDialog();
  /** 1 回の起動で二重に出さない */
  const askedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (askedRef.current) return;
      if (!isPushSupported()) return;
      // 集金を 1 回も登録していない人には出さない
      if (!hasRegisteredCollect()) return;
      if (hasBeenPrimed()) return;

      askedRef.current = true;

      let cancelled = false;

      (async () => {
        // 既に許可済み / 拒否済みなら聞く意味がない
        const current = await getPermission();
        if (cancelled || current !== "undetermined") {
          // 許可済みならトークンだけ同期して終わり
          if (current === "granted") void syncPushToken();
          markPrimed();
          return;
        }

        const ok = await dialog.confirm({
          title: "集金日をお知らせしますか？",
          message:
            "集金日の前日と当日に通知を送ります。在庫が少なくなったときや、機器が故障として登録されたときもお知らせします。",
          confirmLabel: "通知を受け取る",
          cancelLabel: "あとで",
        });

        if (cancelled) return;

        // ⚠️ 「あとで」でも primed を立てる。毎回聞くと鬱陶しく、結局切られる。
        //    後から設定画面でいつでも有効にできる。
        markPrimed();
        if (!ok) return;

        // ここで初めて OS のダイアログが出る
        const granted = await requestPermission();
        if (granted === "granted") void syncPushToken();
      })();

      return () => {
        cancelled = true;
      };
    }, [dialog])
  );
}
