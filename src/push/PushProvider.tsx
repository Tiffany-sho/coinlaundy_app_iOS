import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { isPushSupported, syncPushToken } from "@/push/pushToken";

/**
 * プッシュ通知の受け口。通知のタップで該当画面へ飛ばし、ログイン中は
 * トークンを BFF に同期する。
 *
 * 中身を PushBridge に分けてあるのは、**ブラウザ確認のときに何も動かさないため**。
 * expo-notifications は web にスタブを持っていて（`*.js` が `*.native.js` の
 * 代わりに解決される）落ちはしないが、リスナーを張るたびに
 * "not yet fully supported on web" を console.warn する。実機用の処理を
 * ブラウザで走らせても意味がないので、まるごと出し分ける。
 *
 * ⚠️ フックは条件付きで呼べないので、**分岐は if ではなくコンポーネント境界**で行う。
 *    isPushSupported() はアプリの生存期間中に値が変わらないため、この条件レンダーで
 *    フックの順序は崩れない。expo-iap 側（PlanPurchaseSection）は web 実装が
 *    無く本当に落ちるので、あちらは分離が必須。ここは行儀の問題。
 */
export function PushProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {isPushSupported() && <PushBridge />}
      {children}
    </>
  );
}

/**
 * 通知に載せるデータの取り決め。送信側（Edge Function）と対になっている。
 *
 * ⚠️ `url` は expo-router のパス。送信側で組み立てるので、**画面のパスを変えたら
 *    Edge Function も直すこと**。存在しないパスを渡しても例外にはならず、
 *    ただ何も起きない（原因が分からない不具合になる）。
 */
type PushData = {
  url?: string;
  type?: "collectReminder" | "lowStock" | "machineBreak";
};

function PushBridge() {
  const router = useRouter();
  const { session } = useAuth();

  /** 同じ通知を二度処理しない。cold start と listener の両方から来ることがある */
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    // フォアグラウンドでもバナーを出す。集金中に届く通知を落とさないため
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    function open(response: Notifications.NotificationResponse) {
      const id = response.notification.request.identifier;
      if (handledRef.current === id) return;
      handledRef.current = id;

      const data = response.notification.request.content.data as PushData | undefined;
      if (data?.url) router.push(data.url as Href);
    }

    const sub = Notifications.addNotificationResponseReceivedListener(open);

    // アプリが終了した状態で通知をタップして起動された場合、listener には届かない
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) open(response);
      })
      .catch(() => {});

    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    // 許可済みの端末だけが対象。ここで許可を求めない（プライミングは集金登録後）
    if (!session) return;
    void syncPushToken();
  }, [session]);

  return null;
}
