import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useBootstrap, useCollectSchedule, useUpdateCollectSchedule } from "@/api/queries";
import { Button, Card, CenterMessage, Muted, Screen, Title } from "@/components/ui";
import { formatCountdown } from "@/shared/collectSchedule";
import { color, font, radius, spacing } from "@/theme/tokens";

const WEEK_DAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** 集金スケジュール設定。管理者のみ変更できる */
export default function CollectScheduleSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bootstrap = useBootstrap();
  const { data, isLoading } = useCollectSchedule();
  const update = useUpdateCollectSchedule();

  const isAdmin = bootstrap.data?.organization?.myRole === "admin";

  const [type, setType] = useState<"weekly" | "monthly">("weekly");
  const [days, setDays] = useState<number[]>([]);

  useEffect(() => {
    if (data) {
      setType(data.type);
      setDays(data.days ?? []);
    }
  }, [data]);

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
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  function switchType(next: "weekly" | "monthly") {
    if (!isAdmin) return;
    setType(next);
    setDays([]); // 週と月では日の意味が変わるので選択をリセットする
  }

  const options = type === "weekly" ? WEEK_DAYS.map((_, i) => i) : MONTH_DAYS;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md }}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={color.teal} />
          <Text style={styles.backLabel}>戻る</Text>
        </Pressable>

        <Title style={{ fontSize: 22, marginBottom: spacing.xs }}>集金スケジュール</Title>
        <Muted style={{ marginBottom: spacing.lg }}>
          {days.length > 0 ? formatCountdown({ type, days }) : "集金日は未設定です"}
        </Muted>

        <View style={styles.segment}>
          <SegmentButton label="毎週" active={type === "weekly"} onPress={() => switchType("weekly")} />
          <SegmentButton label="毎月" active={type === "monthly"} onPress={() => switchType("monthly")} />
        </View>

        <Card>
          <Text style={styles.sectionLabel}>
            {type === "weekly" ? "集金する曜日" : "集金する日"}
          </Text>
          <View style={styles.grid}>
            {options.map((day) => {
              const selected = days.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggle(day)}
                  style={[styles.chip, selected && styles.chipSelected, !isAdmin && { opacity: 0.6 }]}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                    {type === "weekly" ? WEEK_DAYS[day] : day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {isAdmin ? (
          <Button
            label="保存"
            onPress={() => update.mutate({ type, days } as never)}
            disabled={days.length === 0}
            loading={update.isPending}
            style={{ marginTop: spacing.xl }}
          />
        ) : (
          <Muted style={{ marginTop: spacing.lg }}>
            集金スケジュールの変更は管理者のみ行えます。
          </Muted>
        )}

        {update.isError && (
          <Text style={styles.error}>
            {update.error instanceof Error ? update.error.message : "保存に失敗しました"}
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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
  segmentButton: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  segmentActive: { backgroundColor: color.cardBg },
  segmentLabel: { fontFamily: font.ui, fontSize: 14, color: color.textMuted },
  segmentLabelActive: { fontFamily: font.uiBold, color: color.teal },
  sectionLabel: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain, marginBottom: spacing.md },
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
  error: { fontFamily: font.ui, fontSize: 14, color: color.red500, marginTop: spacing.md },
});
