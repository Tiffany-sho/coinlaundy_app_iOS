import { useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useBootstrap,
  useDeleteExpense,
  useExpenses,
  useUpdateExpense,
} from "@/api/queries";
import { ApiError } from "@/api/client";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { CenterMessage, Screen } from "@/components/common/ui";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { currentMonthIndex, monthStartEpoch } from "@/components/revenue/monthIndex";

/**
 * 経費の編集。
 *
 * ⚠️ **単票の取得 API は用意していない。** 直前に開いた一覧のキャッシュから引く。
 *    期間で切って取る作りなので「この 1 件だけ」を素直に引く口が無く、
 *    足すと `/expenses/[id]` の GET を増やすことになるため。
 *    ⚠️ そのぶん**キャッシュに無いと編集できない**（アプリを再起動した直後に
 *    ディープリンクで直接来た場合など）。そのときは一覧へ戻す。
 *
 * ⚠️ **毎月の固定費（`recurring:` で始まる id）はここへ来ない。** 一覧側で
 *    行ごと押せなくしてある。万一来てもサーバが 400 で弾く。
 *
 * ⚠️ **編集と削除で条件が違う**（2026-08-03）。
 *    - 編集 … サーバが行ごとに返す `editable`（admin は全部、集金担当者は
 *      **自分が登録した当月の分だけ**）
 *    - 削除 … **admin だけ**
 *    一覧の行を押せなくしてあるので普通は辿り着かないが、
 *    **ディープリンクと「戻る」で直接来られる**のでここでも見る。
 *    正はサーバ（`updateExpense` / `deleteExpense` が 403）。
 */
export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();

  const bootstrap = useBootstrap();
  const isAdmin = bootstrap.data?.organization?.myRole === "admin";

  const update = useUpdateExpense();
  const remove = useDeleteExpense();

  /*
    ⚠️ 直近 13 か月ぶんのキャッシュから探す。一覧は月ごとのキーで持っているので、
       「今開いている月」が分からなくても当たるようにしている。
       ⚠️ ここで新しく取得はしない（enabled を付けずに useExpenses を並べると
       13 本のリクエストが飛ぶ）。react-query のキャッシュ参照で足りる。
  */
  const current = currentMonthIndex();
  const months = useMemo(
    () => Array.from({ length: 13 }, (_, i) => current - i),
    [current]
  );
  const from = monthStartEpoch(months[months.length - 1]);
  const to = monthStartEpoch(current + 1) - 1;

  const list = useExpenses(from, to);
  const expense = (list.data ?? []).find((e) => e.id === id);

  if (list.isLoading && !list.data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  if (!expense) {
    return (
      <Screen>
        <CenterMessage text="この経費は見つかりませんでした" />
      </Screen>
    );
  }

  /*
    ⚠️ **`editable` はサーバの判定。** 古い応答（永続キャッシュ）には無いので、
       そのときだけ「管理者か」に倒す。**true に倒さないこと。**
  */
  if (!(expense.editable ?? isAdmin)) {
    return (
      <Screen>
        <CenterMessage text={"この経費は編集できません。\n自分が登録した今月の分だけ編集できます。"} />
      </Screen>
    );
  }

  async function onDelete() {
    const ok = await dialog.confirm({
      title: "この経費を削除しますか？",
      message: "この操作は取り消せません。",
      confirmLabel: "削除する",
      cancelLabel: "やめる",
      destructive: true,
    });
    if (!ok) return;

    remove.mutate(String(id), {
      onSuccess: () => {
        toast.success("経費を削除しました");
        router.back();
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "削除できませんでした"),
    });
  }

  return (
    <ExpenseForm
      title="経費を編集"
      submitLabel="保存する"
      submitting={update.isPending || remove.isPending}
      initial={{
        storeId: expense.laundryId,
        date: expense.date,
        amount: expense.amount,
        category: expense.category,
        note: expense.note,
      }}
      errorMessage={
        update.error
          ? update.error instanceof ApiError
            ? update.error.message
            : "保存できませんでした"
          : null
      }
      onCancel={() => router.back()}
      /* ⚠️ **削除は管理者だけ。** 編集できても消せるとは限らない（渡さなければ出ない） */
      onDelete={isAdmin ? () => void onDelete() : undefined}
      onSubmit={(value) =>
        update.mutate(
          { id: String(id), ...value },
          {
            onSuccess: () => {
              toast.success("経費を保存しました");
              router.back();
            },
            onError: (e) =>
              toast.error(e instanceof ApiError ? e.message : "保存できませんでした"),
          }
        )
      }
    />
  );
}
