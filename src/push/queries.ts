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
 */
export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) =>
      apiFetch<NotificationPrefs>("/notifications/prefs", { method: "PATCH", body: patch }),
    onSuccess: (next) => queryClient.setQueryData(pushKeys.prefs, next),
  });
}
