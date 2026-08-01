import { useRef } from "react";
import { useRouter } from "expo-router";
import { deleteStoreImage, useBootstrap, useCreateStore } from "@/api/queries";
import { StoreForm, apiErrorMessage, type StoreFormValues } from "@/components/stores/StoreForm";
import { useToast } from "@/components/common/toast";
import { CenterMessage, Screen } from "@/components/common/ui";
import type { StoreImage } from "@/api/types";

/**
 * 店舗の追加。Web の /coinLaundry/new（CoinLaundryForm を method="POST" で描画）を移植。
 *
 * 店舗タブの中の Stack の 1 画面なので、登録後もタブバーが出たままになる
 * （経緯は app/(tabs)/stores/_layout.tsx を見ること）。
 *
 * ⚠️ 写真は選んだ時点で Storage に上がっている。登録に失敗したら Storage 側にゴミが
 *    残るので消して巻き戻す（本家 useStoreSubmit.js:100-104 と同じ）。
 */
export default function NewStore() {
  const router = useRouter();
  const toast = useToast();

  const bootstrap = useBootstrap();
  const create = useCreateStore();

  /** この画面で Storage に上げた写真。登録に失敗したときの掃除対象 */
  const uploaded = useRef<StoreImage[]>([]);

  // 権限は UI の出し分けにだけ使う。正は Server Action 側（admin 以外は createStore が弾く）
  const myRole = bootstrap.data?.organization?.myRole;
  const isAdmin = myRole === "admin";

  if (bootstrap.isLoading && !bootstrap.data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  if (myRole && !isAdmin) {
    return (
      <Screen>
        <CenterMessage text="店舗の追加は店舗管理者のみ行えます。" />
      </Screen>
    );
  }

  function onSubmit(values: StoreFormValues) {
    create.mutate(
      {
        store: values.store,
        location: values.location,
        description: values.description,
        machines: values.machines,
        images: values.images,
        // ⚠️ 店舗ができてからでないと入らないので、サーバが登録の後に流し込む
        paymentMethods: values.paymentMethods,
      },
      {
        onSuccess: (created) => {
          uploaded.current = [];
          toast.success(`${values.store}店を登録しました`);
          // 登録直後は作った店舗を見せる。戻るで一覧に帰れるよう replace で差し替える
          router.replace({ pathname: "/stores/[id]", params: { id: created.id } });
        },
        onError: (error) => {
          void rollbackImages();
          // ⚠️ BFF の日本語をそのまま出す。店舗数の上限も課金に触れない文言が返ってくる
          toast.error(apiErrorMessage(error, "店舗を登録できませんでした"));
        },
      }
    );
  }

  /** 登録できなかったぶんの写真を Storage から消す。失敗しても操作は止めない */
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
        mode="create"
        submitting={create.isPending}
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
