import type { CollectSchedule } from "@/api/types";
import { nowInJst } from "./date";

/**
 * ⚠️ Web の src/functions/collectSchedule.js からの移植（コピー運用）。
 * 通知の Edge Function も同じロジックを使うため、変更時は 3 箇所すべてを揃えること。
 */
export function getNextCollectDate(
  schedule: CollectSchedule | null | undefined
): { daysUntil: number } | null {
  if (!schedule || !Array.isArray(schedule.days) || schedule.days.length === 0) {
    return null;
  }

  const now = nowInJst();
  const todayDow = now.getDay(); // 0=日, 1=月 … 6=土
  const todayDate = now.getDate(); // 1-31
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  if (schedule.type === "weekly") {
    const days = [...schedule.days].sort((a, b) => a - b);
    let minDiff = Infinity;
    for (const d of days) {
      let diff = d - todayDow;
      if (diff < 0) diff += 7;
      if (diff < minDiff) minDiff = diff;
    }
    return { daysUntil: minDiff };
  }

  if (schedule.type === "monthly") {
    const days = [...schedule.days].sort((a, b) => a - b);
    for (const d of days) {
      if (d >= todayDate) return { daysUntil: d - todayDate };
    }
    // 今月の集金日はすべて過ぎているので来月の最初の集金日を返す
    const nextMonthDate = new Date(year, month + 1, days[0]);
    const diffMs = nextMonthDate.getTime() - now.getTime();
    return { daysUntil: Math.ceil(diffMs / (1000 * 60 * 60 * 24)) };
  }

  return null;
}

/** カウントダウンの表示文字列 */
export function formatCountdown(schedule: CollectSchedule | null | undefined): string {
  const next = getNextCollectDate(schedule);
  if (!next) return "集金日は未設定です";
  if (next.daysUntil === 0) return "今日は集金日です";
  if (next.daysUntil === 1) return "明日は集金日です";
  return `次の集金日まで ${next.daysUntil} 日`;
}
