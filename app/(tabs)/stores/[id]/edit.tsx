import { useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { deleteStoreImage, useBootstrap, useStore, useUpdateStore } from "@/api/queries";
import type { StoreImage } from "@/api/types";
import { ApiError } from "@/api/client";
import { StoreForm, apiErrorMessage, type StoreFormValues } from "@/components/stores/StoreForm";
import { useToast } from "@/components/common/toast";
import { CenterMessage, Screen } from "@/components/common/ui";

/**
 * 店舗の編集。Web の /coinLaundry/[id]/edit（CoinLaundryForm を method="PUT" で描画）に当たる。
 *
 * ⚠️ 削除はここに置かない。保存しに来た画面に「元に戻せない削除」が同居していると
 *    誤爆する。削除は店舗詳細の「⋯」メニュー（Web の ActionMenu と同じ位置）だけにある。
 *
 * ⚠️ images はフォームが持っている配列をまるごと送り返すこと。省略すると空配列で
 *    上書きされ、Web で登録した写真まで消える
 *    （api/queries.ts の StoreInput / BFF の stores/[id]/route.js のコメント参照）。
 */
export default function EditStore() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const bootstrap = useBootstrap();
  const { data, isLoading, error } = useStore(id);
  const update = useUpdateStore(id);

  /** この画面で Storage に上げた写真。更新に失敗したときの掃除対象 */
  const uploaded = useRef<StoreImage[]>([]);

  // 権限は UI の出し分けにだけ使う。正は Server Action 側（admin 以外は updateStore / deleteStore が弾く）
  const myRole = bootstrap.data?.organization?.myRole;
  const isAdmin = myRole === "admin";

  if (isLoading && !data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <CenterMessage
          text={error instanceof ApiError ? error.message : "店舗を取得できませんでした"}
        />
      </Screen>
    );
  }

  if (!data) return null;

  if (myRole && !isAdmin) {
    return (
      <Screen>
        <CenterMessage text="店舗の編集は店舗管理者のみ行えます。" />
      </Screen>
    );
  }

  function onSubmit(values: StoreFormValues) {
    update.mutate(
      {
        store: values.store,
        location: values.location,
        description: values.description,
        machines: values.machines,
        // ⚠️ フォームが持っている配列をまるごと返す。省略すると空配列で上書きされて写真が消える
        images: values.images,
      },
      {
        onSuccess: () => {
          const removed = removedImages(data?.images ?? [], values.images);
          uploaded.current = [];
          // 保存が通ってから Storage の実体を消す。先に消すと保存をやめたときに写真だけ失う
          void Promise.all(
            removed.map((path) => deleteStoreImage(path).catch(() => undefined))
          );
          toast.success(`${values.store}店を更新しました`);
          router.back();
        },
        onError: (e) => {
          void rollbackImages();
          // ⚠️ BFF の日本語をそのまま出す
          toast.error(apiErrorMessage(e, "店舗を更新できませんでした"));
        },
      }
    );
  }

  /** 更新できなかったぶんの写真を Storage から消す。失敗しても操作は止めない */
  async function rollbackImages() {
    const targets = uploaded.current.filter((image) => image.path);
    uploaded.current = [];
    await Promise.all(
      targets.map((image) => deleteStoreImage(image.path as string).catch(() => undefined))
    );
  }

  return (
    <Screen>
      <StoreForm
        mode="edit"
        initial={{
          store: data.store,
          location: data.location,
          description: data.description,
          machines: data.machines,
          images: data.images,
        }}
        submitting={update.isPending}
        onSubmit={onSubmit}
        onImageUploaded={(image) => uploaded.current.push(image)}
        onCancel={() => {
          void rollbackImages();
          router.canGoBack() ? router.back() : router.replace("/stores");
        }}
      />
    </Screen>
  );
}

/**
 * 保存後に Storage から消すべき写真の path。
 * 元の配列にあって新しい配列に無いものが「外された写真」。
 * path を持たない古いデータ（Web の初期実装）は消しようがないので対象外。
 */
function removedImages(before: StoreImage[], after: StoreImage[]): string[] {
  const kept = new Set(after.map((image) => image.path).filter(Boolean));
  return before
    .map((image) => image.path)
    .filter((path): path is string => Boolean(path) && !kept.has(path));
}
