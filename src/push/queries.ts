import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";

/**
 * 通知設定（profiles.notification_prefs）。
 *
 * ⚠️ queries.ts に置いていないのは、あちらが既に 500 行を超えているため。
 *    通知まわりは src/push/ に閉じてある。
 */

export type NotificationPrefs = {
  collectReminder: boolean;
  lowStock: boolean;
  machineBreak: boolean;
  /** 0〜23。JST の何時に集金リマインダを送るか */
  reminderHour: number;
};

export const pushKeys = {
  prefs: ["notifications", "prefs"] as const,
};

export function useNotificationPrefs(enabled = true) {
  return useQuery({
    queryKey: pushKeys.prefs,
    queryFn: () => apiFetch<NotificationPrefs>("/notifications/prefs"),
    enabled,
  });
}

/**
 * ⚠️ サーバ側が現在値とマージしてから書く。部分的に送って問題ない。
 *    逆に言うと、jsonb を直接置き換える実装に変えると送らなかった項目が消える。
 *
 * ⚠️ **楽観的更新にしてある。** 応答を待ってから画面を変えると、トグルを押しても
 *    往復のあいだ動かず「一瞬固まってから切り替わる」ように見える（実際そう見えていた）。
 *    先にキャッシュを書き換えて即座に反映し、失敗したら onError で巻き戻す。
 *
 * ⚠️ **`scope` で直列化している。** 外すと連打したぶんの PATCH が並走し、
 *    遅い応答が後から届いて新しい状態を上書きする（押した結果と逆になる）。
 *    同じ scope.id の mutation は前のものが終わるまで走らない。
 */
export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: "notification-prefs" },
    mutationFn: (patch: Partial<NotificationPrefs>) =>
      apiFetch<NotificationPrefs>("/notifications/prefs", { method: "PATCH", body: patch }),

    onMutate: async (patch) => {
      // 走っている取得を止める。あとから届くと楽観的更新を上書きする
      await queryClient.cancelQueries({ queryKey: pushKeys.prefs });
      const previous = queryClient.getQueryData<NotificationPrefs>(pushKeys.prefs);
      if (previous) {
        queryClient.setQueryData<NotificationPrefs>(pushKeys.prefs, { ...previous, ...patch });
      }
      return { previous };
    },

    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(pushKeys.prefs, context.previous);
    },

    // サーバが返した確定値で上書きする（既定値の補完がここで入る）
    onSuccess: (next) => queryClient.setQueryData(pushKeys.prefs, next),
  });
}
