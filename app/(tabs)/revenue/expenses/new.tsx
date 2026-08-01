import { useRouter } from "expo-router";
import { useCreateExpense } from "@/api/queries";
import { ApiError } from "@/api/client";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { useToast } from "@/components/common/toast";

/** 経費の追加。⚠️ 見た目とローカルな状態は ExpenseForm 側に置く（ルートは組み立てだけ） */
export default function NewExpenseScreen() {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateExpense();

  return (
    <ExpenseForm
      title="経費を追加"
      submitLabel="登録する"
      submitting={create.isPending}
      errorMessage={
        create.error ? (create.error instanceof ApiError ? create.error.message : "登録できませんでした") : null
      }
      onCancel={() => router.back()}
      onSubmit={(value) =>
        create.mutate(value, {
          onSuccess: () => {
            /* ⚠️ 戻る直前のトーストなので、画面のアンマウントより前に出す必要がある。
                  この画面は通常の push なのでルートの ToastProvider がそのまま使える
                  （fullScreenModal ではないため、集金画面のような掴み直しは不要）。 */
            toast.success("経費を登録しました");
            router.back();
          },
          onError: (e) =>
            toast.error(e instanceof ApiError ? e.message : "登録できませんでした"),
        })
      }
    />
  );
}
