import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useBootstrap,
  useCreatePaymentMethod,
  usePaymentMethods,
  useUpdatePaymentMethod,
} from "@/api/queries";
import { ApiError } from "@/api/client";
import { Button, Card, CenterMessage, Muted, Screen } from "@/components/common/ui";
import { Field, FormError, Input } from "@/components/common/form";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { PaymentMethod } from "@/api/types";

/**
 * 支払方法の設定。集金画面でキャッシュレスの金額を入れる欄がここから決まる。
 *
 * ⚠️ **「現金」は作れない。** 現金は常に記録される暗黙の方法で、
 *    金額は「総額 − キャッシュレスの合計」で出している。同名の行を作ると
 *    集金画面に現金が 2 つ並び、片方が総額に二重計上される（サーバも弾く）。
 *
 * ⚠️ **削除はできない。使用停止だけ。** 過去の集金が methodId で参照しているので、
 *    行を消すと支払方法別の絞り込みで「どの方法か分からない金額」になる。
 *
 * ⚠️ **名前を変えても過去の履歴の表示は変わらない。** 集金レコードに
 *    その時点の名前を焼き込んであるため（設備名と同じ）。意図した挙動。
 */
export default function PaymentMethodsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();

  const bootstrap = useBootstrap();
  const isAdmin = bootstrap.data?.organization?.myRole === "admin";

  const { data, isLoading, isRefetching, refetch, error } = usePaymentMethods();
  const create = useCreatePaymentMethod();
  const update = useUpdatePaymentMethod();

  const [name, setName] = useState("");

  const methods = data ?? [];
  const active = methods.filter((m) => m.isActive);
  const inactive = methods.filter((m) => !m.isActive);
  const isOffline = error instanceof ApiError && error.code === "OFFLINE";

  function onAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(trimmed, {
      onSuccess: (created) => {
        setName("");
        toast.success(`${created.name} を追加しました`);
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "追加できませんでした"),
    });
  }

  async function onToggle(method: PaymentMethod) {
    if (method.isActive) {
      const ok = await dialog.confirm({
        title: `${method.name} を使用停止にしますか？`,
        message:
          "集金画面の入力欄から外れます。これまでに記録した金額はそのまま残り、あとから再開できます。",
        confirmLabel: "使用停止にする",
        cancelLabel: "やめる",
      });
      if (!ok) return;
    }

    update.mutate(
      { id: method.id, isActive: !method.isActive },
      {
        onSuccess: () =>
          toast.success(method.isActive ? "使用停止にしました" : "再開しました"),
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : "変更できませんでした"),
      }
    );
  }

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle}>支払方法</Text>
        <View style={styles.headerButton} />
      </View>

      {isLoading && !data ? (
        <CenterMessage text="読み込み中…" />
      ) : isOffline && !data ? (
        <CenterMessage text="オフラインです" />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl,
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={color.teal} />
          }
        >
          <Muted style={styles.lead}>
            集金のときに、現金以外で受け取った金額を記録できます。
            現金は設定しなくても常に記録されます。
          </Muted>

          <Card style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>使用中</Text>
            {active.length === 0 ? (
              <Muted style={styles.empty}>まだ登録されていません</Muted>
            ) : (
              active.map((m, i) => (
                <MethodRow
                  key={m.id}
                  method={m}
                  last={i === active.length - 1}
                  canEdit={isAdmin}
                  busy={update.isPending && update.variables?.id === m.id}
                  onToggle={() => void onToggle(m)}
                />
              ))
            )}
          </Card>

          {inactive.length > 0 && (
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={styles.sectionTitle}>使用停止中</Text>
              {inactive.map((m, i) => (
                <MethodRow
                  key={m.id}
                  method={m}
                  last={i === inactive.length - 1}
                  canEdit={isAdmin}
                  busy={update.isPending && update.variables?.id === m.id}
                  onToggle={() => void onToggle(m)}
                />
              ))}
            </Card>
          )}

          {isAdmin ? (
            <Card style={{ marginTop: spacing.lg }}>
              <Text style={styles.sectionTitle}>支払方法を追加</Text>
              <Field label="名前">
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="例) PayPay"
                  maxLength={20}
                  autoCapitalize="none"
                />
              </Field>
              {create.error && (
                <FormError
                  message={
                    create.error instanceof ApiError ? create.error.message : "追加できませんでした"
                  }
                />
              )}
              <Button
                label="追加"
                variant="gradient"
                icon="add"
                loading={create.isPending}
                disabled={name.trim().length === 0}
                onPress={onAdd}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : (
            <Muted style={{ marginTop: spacing.lg }}>
              支払方法の変更は管理者のみ行えます。
            </Muted>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function MethodRow({
  method,
  last,
  canEdit,
  busy,
  onToggle,
}: {
  method: PaymentMethod;
  last: boolean;
  canEdit: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={[styles.rowName, !method.isActive && { color: color.textFaint }]}>
        {method.name}
      </Text>
      {canEdit && (
        <Pressable
          onPress={onToggle}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${method.name} を${method.isActive ? "使用停止にする" : "再開する"}`}
          style={({ pressed }) => [styles.rowAction, pressed && { opacity: 0.6 }]}
        >
          <Text
            style={[styles.rowActionText, method.isActive && { color: color.red400 }]}
          >
            {method.isActive ? "使用停止" : "再開する"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: font.uiBold, fontSize: 17, color: color.tealDeeper },
  lead: { fontSize: 13, lineHeight: 20 },
  sectionTitle: {
    fontFamily: font.uiBold,
    fontSize: 13,
    color: color.tealDeeper,
    marginBottom: spacing.sm,
  },
  empty: { fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  rowName: { flex: 1, fontFamily: font.ui, fontSize: 15, color: color.textMain },
  rowAction: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md },
  rowActionText: { fontFamily: font.uiBold, fontSize: 13, color: color.teal },
});
