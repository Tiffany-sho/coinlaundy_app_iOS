import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useBootstrap, useCollectSchedule, useUpdateCollectSchedule } from "@/api/queries";
import { apiErrorMessage } from "@/components/stores/StoreForm";
import { useToast } from "@/components/common/toast";
import { Button, Card, CenterMessage, Muted, Screen, Title } from "@/components/common/ui";
import { formatCountdown } from "@/shared/collectSchedule";
import { color, font, radius, spacing } from "@/theme/tokens";

const WEEK_DAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * 集金スケジュールの選び方。
 *
 * ⚠️ `none` は BFF に `{ schedule: null }` として送る（未設定に戻す）。
 *    `days: []` を送るのではない。あちらは「集金日を 1 つ以上選んでください」で 400 になる。
 */
type ScheduleMode = "none" | "weekly" | "monthly";

const MODES: { value: ScheduleMode; label: string }[] = [
  { value: "none", label: "設定しない" },
  { value: "weekly", label: "毎週" },
  { value: "monthly", label: "毎月" },
];

/** 集金スケジュール設定。管理者のみ変更できる */
export default function CollectScheduleSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const bootstrap = useBootstrap();
  const { data, isLoading } = useCollectSchedule();
  const update = useUpdateCollectSchedule();

  const isAdmin = bootstrap.data?.organization?.myRole === "admin";

  const [mode, setMode] = useState<ScheduleMode>("none");
  const [days, setDays] = useState<number[]>([]);

  /**
   * ⚠️ **依存に `data` や `data.days` をそのまま置かない。** どちらも参照なので、
   *    react-query が取り直すたびに（画面復帰・再接続でも起きる）中身が同じでも
   *    新しい参照が来て、**選択中の曜日が編集途中で戻る。**
   *    文字列に畳んでから比べること。
   * ⚠️ data が null（未設定）のときは "none" にする。以前は "weekly" のまま
   *    残していたので、未設定なのに毎週が選ばれているように見えていた。
   */
  const daysKey = (data?.days ?? []).join(",");
  useEffect(() => {
    setMode(data ? data.type : "none");
    setDays(daysKey === "" ? [] : daysKey.split(",").map(Number));
  }, [data?.type, daysKey]);

  if (isLoading && !data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  function toggle(day: number) {
    if (!isAdmin) return;
    Haptics.selectionAsync().catch(() => {});
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  function switchMode(next: ScheduleMode) {
    if (!isAdmin) return;
    Haptics.selectionAsync().catch(() => {});
    setMode(next);
    // 週と月では日の意味が変わるので選択をリセットする（設定しないなら空でよい）
    setDays([]);
  }

  async function onSave() {
    /**
     * ⚠️ 「設定しない」は null を送る。`{ type, days: [] }` ではない。
     *    BFF は days が空だと 400（「集金日を 1 つ以上選んでください」）を返す。
     */
    const schedule = mode === "none" ? null : { type: mode, days };
    try {
      await update.mutateAsync(schedule);
      toast.success(
        mode === "none" ? "集金スケジュールを未設定にしました" : "集金スケジュールを保存しました"
      );
      router.back();
    } catch (e) {
      // ⚠️ BFF の日本語をそのまま出す
      toast.error(apiErrorMessage(e, "集金スケジュールを保存できませんでした"));
    }
  }

  const options = mode === "weekly" ? WEEK_DAYS.map((_, i) => i) : MONTH_DAYS;
  // 「設定しない」なら日を選ぶ必要が無いので、そのまま保存できる
  const canSave = mode === "none" || days.length > 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing.xxl,
        }}
      >
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={color.teal} />
          <Text style={styles.backLabel}>戻る</Text>
        </Pressable>

        <Title style={{ fontSize: 22, marginBottom: spacing.xs }}>集金スケジュール</Title>
        <Muted style={{ marginBottom: spacing.lg }}>
          {mode === "none"
            ? "集金日を決めずに使います"
            : days.length > 0
              ? formatCountdown({ type: mode, days })
              : "集金日は未設定です"}
        </Muted>

        <View style={styles.segment}>
          {MODES.map((item) => (
            <SegmentButton
              key={item.value}
              label={item.label}
              active={mode === item.value}
              onPress={() => switchMode(item.value)}
            />
          ))}
        </View>

        {mode === "none" ? (
          <Card>
            <Text style={styles.sectionLabel}>集金日を設定しない</Text>
            <Muted style={{ lineHeight: 19 }}>
              ホームのカウントダウンは出ません。集金日の前日・当日のリマインダー通知も
              届かなくなります。集金の登録はこれまでどおりできます。
            </Muted>
          </Card>
        ) : (
          <Card>
            <Text style={styles.sectionLabel}>
              {mode === "weekly" ? "集金する曜日" : "集金する日"}
            </Text>
            <View style={styles.grid}>
              {options.map((day) => {
                const selected = days.includes(day);
                return (
                  <Pressable
                    key={day}
                    onPress={() => toggle(day)}
                    style={[
                      styles.chip,
                      selected && styles.chipSelected,
                      !isAdmin && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                      {mode === "weekly" ? WEEK_DAYS[day] : day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}

        {isAdmin ? (
          <Button
            label="保存"
            onPress={() => void onSave()}
            disabled={!canSave}
            loading={update.isPending}
            style={{ marginTop: spacing.xl }}
          />
        ) : (
          <Muted style={{ marginTop: spacing.lg }}>
            集金スケジュールの変更は管理者のみ行えます。
          </Muted>
        )}
      </ScrollView>
    </Screen>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentActive]}>
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  backLabel: { fontFamily: font.ui, fontSize: 15, color: color.teal },
  segment: {
    flexDirection: "row",
    backgroundColor: color.divider,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: spacing.lg,
  },
  segmentButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  segmentActive: { backgroundColor: color.cardBg },
  segmentLabel: { fontFamily: font.ui, fontSize: 14, color: color.textMuted },
  segmentLabelActive: { fontFamily: font.uiBold, color: color.teal },
  sectionLabel: {
    fontFamily: font.uiBold,
    fontSize: 13,
    color: color.textMain,
    marginBottom: spacing.md,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: color.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: color.teal },
  chipLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.textMuted },
  chipLabelSelected: { color: "#FFFFFF" },
});
