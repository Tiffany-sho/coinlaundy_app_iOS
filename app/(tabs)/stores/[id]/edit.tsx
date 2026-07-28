import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { deleteStoreImage, useBootstrap, useStore, useUpdateStore } from "@/api/queries";
import type { StoreImage } from "@/api/types";
import { ApiError } from "@/api/client";
import { StoreForm, apiErrorMessage, type StoreFormValues } from "@/components/stores/StoreForm";
import { useDeleteStoreAction } from "@/components/stores/useDeleteStoreAction";
import { useToast } from "@/components/common/toast";
import { CenterMessage, Screen } from "@/components/common/ui";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 店舗の編集と削除。Web の /coinLaundry/[id]/edit（CoinLaundryForm を method="PUT" で描画）と
 * ActionMenu の DeleteStoreDialog をまとめて 1 画面にしたもの。
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
  // 削除の確認と後始末は店舗詳細のメニューと共通（重複実装しない）
  const { confirmDelete, isDeleting } = useDeleteStoreAction(id, data?.store ?? "");

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
        <CenterMessage text="店舗の編集・削除は店舗管理者のみ行えます。" />
      </Screen>
    );
  }

  const storeName = data.store;
  const busy = update.isPending || isDeleting;

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
      >
        {/* 削除。Web は店舗詳細の ActionMenu に置いているが、アプリは編集画面にまとめる */}
        <View style={styles.dangerZone}>
          <View style={styles.dangerHead}>
            <Ionicons name="warning-outline" size={16} color={color.red500} />
            <Text style={styles.dangerTitle}>この店舗を削除</Text>
          </View>
          <Text style={styles.dangerLead}>
            店舗を削除すると、これまでの集金データと在庫・設備の状況もすべて削除されます。元に戻せません。
          </Text>
          <Pressable
            onPress={() => void confirmDelete()}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.dangerButton,
              pressed && !busy && { opacity: 0.85 },
              busy && { opacity: 0.45 },
            ]}
          >
            <Ionicons name="trash-outline" size={17} color={color.red500} />
            <Text style={styles.dangerButtonLabel}>
              {isDeleting ? "削除中…" : `${storeName}店を削除する`}
            </Text>
          </Pressable>
        </View>
      </StoreForm>
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

const styles = StyleSheet.create({
  dangerZone: {
    backgroundColor: color.red50,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.red400,
    padding: spacing.lg,
    gap: spacing.md,
  },
  dangerHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dangerTitle: { fontFamily: font.uiBold, fontSize: 15, color: color.red500 },
  dangerLead: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, lineHeight: 18 },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: color.red400,
    backgroundColor: color.cardBg,
  },
  dangerButtonLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.red500 },
});
