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
import { useToast } from "@/components/common/toast";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";

/** 集金リマインダを送る時刻の候補。深夜は現場が見ないので出さない */
const HOURS = [6, 7, 8, 9, 10, 12, 15, 18, 20];

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
                      <Switch
                        value={Boolean(data?.[item.key])}
                        disabled={blocked || update.isPending}
                        onValueChange={(value) => set({ [item.key]: value })}
                        trackColor={{ true: color.teal, false: color.divider }}
                      />
                    </View>
                  ))}
                </Card>

                <Text style={styles.sectionLabel}>集金日のお知らせを送る時刻</Text>
                <View style={[styles.hourGrid, blocked && { opacity: 0.5 }]}>
                  {HOURS.map((hour) => {
                    const selected = data?.reminderHour === hour;
                    return (
                      <Pressable
                        key={hour}
                        onPress={() => set({ reminderHour: hour })}
                        disabled={blocked || update.isPending}
                        accessibilityRole="button"
                        style={[styles.hour, selected && styles.hourSelected]}
                      >
                        <Text style={[styles.hourLabel, selected && styles.hourLabelSelected]}>
                          {hour}:00
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
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
  hourGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  hour: {
    minWidth: 64,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    backgroundColor: color.cardBg,
  },
  hourSelected: { backgroundColor: color.tealPale, borderColor: color.cyan400 },
  hourLabel: { ...numeric, fontSize: 13, color: color.textMuted },
  hourLabelSelected: { color: color.tealDeeper },
});
