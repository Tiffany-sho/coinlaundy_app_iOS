import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useNotificationPrefs, useUpdateNotificationPrefs } from "@/push/queries";
import type { NotificationPrefs } from "@/push/queries";
import {
  getPermission,
  isPushSupported,
  markPrimed,
  requestPermission,
  syncPushToken,
  type PushPermission,
} from "@/push/pushToken";
import { Card, CenterMessage, Muted, Screen, Title } from "@/components/common/ui";
import { Select, type SelectOption } from "@/components/common/form";
import { useToast } from "@/components/common/toast";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 集金リマインダを送る時刻。
 *
 * ⚠️ **0〜23 の範囲を外れた値を送らない。** Edge Function は毎時起動して現在の
 *    JST 時刻と突き合わせるので、範囲外だと永久に一致せず通知が止まる
 *    （BFF 側でも弾いている。docs/contracts.md）。
 */
const HOUR_OPTIONS: SelectOption<number>[] = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: `${hour}:00`,
}));

/**
 * 送信側の既定値（docs/contracts.md）。
 *
 * ⚠️ **MMKV に残った古い応答には `reminderHour` が無いことがある。**
 *    型は number なので TypeScript は何も言わないが実体は undefined で、
 *    そのままだとセレクトが「選択してください」になり未設定に見える。
 *    サーバも「キーが無い＝8時」として扱うので、ここで補うのが実態と合う。
 */
const DEFAULT_REMINDER_HOUR = 8;

const ITEMS: { key: keyof NotificationPrefs; label: string; note: string }[] = [
  { key: "collectReminder", label: "集金日のお知らせ", note: "集金日の前日と当日に通知します" },
  { key: "lowStock", label: "在庫が少ないとき", note: "洗剤・柔軟剤が警告ラインを下回ったとき" },
  { key: "machineBreak", label: "機器の故障", note: "機器が故障として登録されたとき" },
];

export default function NotificationSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const { data, isLoading, isError } = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();

  const [permission, setPermission] = useState<PushPermission>("undetermined");

  useEffect(() => {
    void getPermission().then(setPermission);
  }, []);

  async function enable() {
    const next = await requestPermission();
    setPermission(next);
    markPrimed();
    if (next === "granted") {
      await syncPushToken();
      toast.success("通知を有効にしました");
      return;
    }
    // ⚠️ 一度拒否した端末では requestPermission がダイアログを出さずに即 denied を返す。
    //    設定アプリへ送るしか手がない
    toast.error("端末の設定から通知を許可してください");
  }

  function set(patch: Partial<NotificationPrefs>) {
    update.mutate(patch, {
      onSuccess: () => toast.success("保存しました"),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "保存できませんでした"),
    });
  }

  if (isLoading && !data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  const blocked = permission !== "granted";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
      >
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={color.teal} />
          <Text style={styles.backLabel}>戻る</Text>
        </Pressable>

        <Title style={{ fontSize: 22, marginBottom: spacing.lg }}>通知</Title>

        {!isPushSupported() ? (
          <Muted>
            通知は iPhone アプリでのみ利用できます。
          </Muted>
        ) : (
          <>
            {blocked && (
              <Card style={styles.permissionCard}>
                <Text style={styles.permissionTitle}>通知が許可されていません</Text>
                <Text style={styles.permissionNote}>
                  {permission === "denied"
                    ? "端末の設定アプリから Collecie の通知を許可してください。"
                    : "通知を有効にすると、集金日や在庫のお知らせを受け取れます。"}
                </Text>
                <Pressable
                  onPress={() =>
                    permission === "denied" ? void Linking.openSettings() : void enable()
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.permissionButton, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.permissionButtonLabel}>
                    {permission === "denied" ? "設定を開く" : "通知を有効にする"}
                  </Text>
                </Pressable>
              </Card>
            )}

            {isError ? (
              <Muted style={{ marginTop: spacing.lg }}>通知設定を取得できませんでした。</Muted>
            ) : (
              <>
                <Card style={{ marginTop: blocked ? spacing.md : 0, opacity: blocked ? 0.5 : 1 }}>
                  {ITEMS.map((item, i) => (
                    <View key={item.key} style={[styles.row, i > 0 && styles.rowBordered]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowLabel}>{item.label}</Text>
                        <Text style={styles.rowNote}>{item.note}</Text>
                      </View>
                      {/*
                        ⚠️ **isPending で disabled にしない。** 押してから応答が返るまで
                           操作を止めると、その間トグルが動かず「固まってから切り替わる」
                           ように見える。楽観的更新（src/push/queries.ts）で即座に
                           反映し、失敗したら自動で戻る。
                      */}
                      <Switch
                        value={Boolean(data?.[item.key])}
                        disabled={blocked}
                        onValueChange={(value) => set({ [item.key]: value })}
                        trackColor={{ true: color.teal, false: color.divider }}
                      />
                    </View>
                  ))}
                </Card>

                <Text style={styles.sectionLabel}>集金日のお知らせを送る時刻</Text>
                <Select
                  title="お知らせを送る時刻"
                  value={data?.reminderHour ?? DEFAULT_REMINDER_HOUR}
                  options={HOUR_OPTIONS}
                  onChange={(reminderHour) => set({ reminderHour })}
                  disabled={blocked}
                />
                <Muted style={{ fontSize: 11, marginTop: spacing.sm }}>
                  日本時間です。前日のお知らせも同じ時刻に届きます。
                </Muted>
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  backLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.teal },

  permissionCard: { backgroundColor: color.orange100, borderColor: color.orange200, borderWidth: 1 },
  permissionTitle: { fontFamily: font.uiBold, fontSize: 14, color: "#7C2D12" },
  permissionNote: {
    fontFamily: font.ui,
    fontSize: 12,
    color: "#7C2D12",
    lineHeight: 18,
    marginTop: 4,
  },
  permissionButton: {
    marginTop: spacing.md,
    minHeight: 44,
    borderRadius: radius.lg,
    backgroundColor: color.orange500,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionButtonLabel: { fontFamily: font.uiBold, fontSize: 14, color: "#FFFFFF" },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowBordered: { borderTopWidth: 1, borderTopColor: color.divider },
  rowLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  rowNote: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 2 },

  sectionLabel: {
    fontFamily: font.uiBold,
    fontSize: 12,
    color: color.textMuted,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
});
