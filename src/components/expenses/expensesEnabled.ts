import type { Organization } from "@/api/types";

/**
 * この組織で経費の機能を使うか（012）。
 *
 * ⚠️ **判定を各画面に書かない。必ずこれを通す。** 出し分けが 5 か所以上あり、
 *    `?? true` / `=== true` / `Boolean(...)` が混ざると、**画面によって
 *    出たり出なかったりする。**
 *
 * ⚠️ **未指定は「使う」。** 理由は 2 つあり、どちらも同じ向きに倒れる:
 *      - サーバの既定が true（012 は既存の組織を全部 true で埋める）
 *      - この項目を返す前の応答が react-query の永続キャッシュ（MMKV）から
 *        最大 7 日復元される。false に倒すと**アップデート直後だけ経費が消える**
 */
export function expensesEnabled(organization: Organization | null | undefined): boolean {
  return organization?.expensesEnabled !== false;
}
