import { useRouter } from "expo-router";
import { useDeleteStore } from "@/api/queries";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { apiErrorMessage } from "@/components/stores/StoreForm";

/**
 * 店舗の削除。店舗詳細のメニューと編集ページの両方から呼ぶので 1 か所にまとめてある。
 *
 * ⚠️ 確認は 2 段階。集金データも在庫・設備の状況も道連れに消えるため。
 *    Web の DeleteStoreDialog は最後に店舗名を打たせるが、useDialog に入力欄が無いので
 *    代わりにもう一度確認を取る形にしている。
 * ⚠️ Alert.alert は react-native-web で空関数なので使わないこと（ブラウザで無反応になる）。
 */
export function useDeleteStoreAction(id: string, storeName: string) {
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const remove = useDeleteStore(id);

  async function confirmDelete() {
    const ok = await dialog.confirm({
      title: `${storeName}店を削除しますか？`,
      message: "この店舗の集金データと在庫状況もすべて削除されます。削除すると元に戻せません。",
      confirmLabel: "削除する",
      destructive: true,
    });
    if (!ok) return;

    const sure = await dialog.confirm({
      title: "本当に削除しますか？",
      message: `${storeName}店のこれまでの集金記録と在庫・設備の状況が失われます。この操作は取り消せません。`,
      confirmLabel: "完全に削除する",
      cancelLabel: "やめる",
      destructive: true,
    });
    if (!sure) return;

    remove.mutate(undefined, {
      onSuccess: () => {
        toast.success(`${storeName}店を削除しました`);
        // 消した店舗の詳細・編集がスタックに残るので、一覧まで戻す
        router.dismissTo("/stores");
      },
      // ⚠️ BFF の日本語をそのまま出す
      onError: (e) => toast.error(apiErrorMessage(e, "店舗を削除できませんでした")),
    });
  }

  return { confirmDelete, isDeleting: remove.isPending };
}
