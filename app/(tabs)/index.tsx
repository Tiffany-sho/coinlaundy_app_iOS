import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap, useHome, useMonthlySummary, queryKeys } from "@/api/queries";
import { useOutbox } from "@/offline/OutboxProvider";
import { usePushPriming } from "@/push/usePushPriming";
import { ApiError } from "@/api/client";
import { GreetingHeader } from "@/components/home/GreetingHeader";
import { CollectCountdown } from "@/components/home/CollectCountdown";
import { MonthlySalesCarousel } from "@/components/home/MonthlySalesCarousel";
import { QuickActions } from "@/components/home/QuickActions";
import {
  Card,
  ListCard,
  ListEmpty,
  ListRow,
  MoneyText,
  Muted,
  OfflineBanner,
  Screen,
  SectionHeading,
} from "@/components/common/ui";
import { formatJstDate } from "@/shared/date";
import { color, font, radius, spacing } from "@/theme/tokens";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  // 初回の集金登録を終えた人にだけ通知許可を聞く（集金モーダルの中では聞けない）
  usePushPriming();

  const bootstrap = useBootstrap();
  const hasOrg = Boolean(bootstrap.data?.organization);
  const home = useHome(hasOrg);
  /**
   * 月の集金カードの数字はこの 1 本だけを正とする。
   *
   * 当月の値は useHome() の monthTotal / collectCount からも取れるが、BFF 側の
   * 集計元が違う（/home は getMonthFunds()＝ユーザー権限のクライアント、
   * /funds/summary/monthly は getCollectMonthlySummary()＝サービスクライアントで
   * 過去 2 年分）。当月だけ別ソースにするとスワイプで先月と当月を見比べたときに
   * 集計範囲の違う数字が並ぶので、カードの中は全月 useMonthlySummary() に揃える。
   * useHome() は在庫・設備・最近の集金記録の担当。
   */
  const monthly = useMonthlySummary(undefined, hasOrg);
  const outbox = useOutbox();

  const isOffline =
    (home.error instanceof ApiError && home.error.code === "OFFLINE") ||
    (monthly.error instanceof ApiError && monthly.error.code === "OFFLINE") ||
    (bootstrap.error instanceof ApiError && bootstrap.error.code === "OFFLINE");

  const username = bootstrap.data?.profile?.username ?? "集金担当者";

  function onRefresh() {
    queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
    queryClient.invalidateQueries({ queryKey: queryKeys.home });
    // 月次サマリーのキーは ["funds", "summary", "monthly", …] なので前方一致で落ちる
    queryClient.invalidateQueries({ queryKey: queryKeys.funds });
  }

  if (!bootstrap.data?.organization) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.lg }]}>
          <GreetingHeader username={username} />
          <Card style={{ marginTop: spacing.lg }}>
            <Muted>組織に所属すると、集金データや店舗の情報が表示されます。</Muted>
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  const recent = home.data?.recentFunds ?? [];

  return (
    <Screen>
      {isOffline && <OfflineBanner />}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.lg }]}
        refreshControl={
          <RefreshControl
            refreshing={bootstrap.isRefetching || home.isRefetching}
            onRefresh={onRefresh}
            tintColor={color.teal}
          />
        }
      >
        <GreetingHeader username={username} />

        {outbox.items.length > 0 && (
          <Pressable onPress={() => outbox.flush()} style={styles.outboxBadge}>
            <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
            <Text style={styles.outboxText}>
              未送信 {outbox.pendingCount} 件
              {outbox.failedCount > 0 ? `（送信失敗 ${outbox.failedCount} 件）` : ""}・タップで再送
            </Text>
          </Pressable>
        )}

        {/* ヒーローは月ごとに配色が変わる（Web と同じ）。横スワイプで過去の月へ */}
        <View style={{ marginTop: spacing.lg }}>
          <MonthlySalesCarousel
            data={monthly.data}
            isLoading={monthly.isLoading && !monthly.data}
            isError={Boolean(monthly.error)}
          />
        </View>

        {/* 集金日のカウントダウンは月のカードの下。まず金額、次に次回予定の順で読ませる */}
        <View style={{ marginTop: spacing.lg }}>
          <CollectCountdown schedule={bootstrap.data.collectSchedule} />
        </View>

        {/* Web と同じ位置（売上カードの下・今日の対応状況の上） */}
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeading>クイックアクション</SectionHeading>
          <QuickActions myRole={bootstrap.data.organization.myRole} />
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeading>今日の対応状況</SectionHeading>
          <View style={styles.statusRow}>
            <StatusCard
              icon="cube-outline"
              label="在庫状況"
              count={home.data?.lowStockCount ?? 0}
              onPress={() => router.push("/manage")}
            />
            <StatusCard
              icon="construct-outline"
              label="設備状況"
              count={home.data?.brokenMachineCount ?? 0}
              onPress={() => router.push("/manage")}
            />
          </View>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <ListCard
            icon="time-outline"
            title="過去1ヶ月の集金記録"
            actionLabel="すべて見る"
            onAction={() => router.push("/revenue")}
          >
            {home.isLoading && !home.data ? (
              <ListEmpty text="読み込み中…" />
            ) : recent.length === 0 ? (
              <ListEmpty text="過去1ヶ月の集金記録はありません" />
            ) : (
              recent.map((fund, i) => (
                <ListRow key={String(fund.id)} last={i === recent.length - 1}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{fund.laundryName}</Text>
                    <View style={styles.rowMetaRow}>
                      <Text style={styles.rowMeta}>{formatJstDate(fund.date)}</Text>
                      {fund.collecter && <Text style={styles.rowFaint}>{fund.collecter}</Text>}
                    </View>
                  </View>
                  <MoneyText value={fund.totalFunds} size={15} tone="deeper" />
                </ListRow>
              ))
            )}
          </ListCard>
        </View>
      </ScrollView>
    </Screen>
  );
}

/** Web の StatusCard。問題がなければ teal、あればオレンジで「N店舗 要対応」 */
function StatusCard({
  icon,
  label,
  count,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  count: number;
  onPress: () => void;
}) {
  const isAlert = count > 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.statusCard,
        { borderColor: isAlert ? "transparent" : color.cyan100 },
        pressed && { opacity: 0.82 },
      ]}
    >
      <View
        style={[
          styles.statusIcon,
          { backgroundColor: isAlert ? color.orange100 : color.teal },
        ]}
      >
        <Ionicons name={icon} size={16} color={isAlert ? color.orange500 : "#FFFFFF"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={[styles.statusValue, { color: isAlert ? color.orange500 : color.tealDeeper }]}>
          {isAlert ? `${count}店舗 要対応` : "問題なし"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={isAlert ? color.orange200 : color.cyan300} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
  /* ヒーロー関連のスタイルは MonthlySalesCarousel 側へ移した */
  statusRow: { flexDirection: "row", gap: spacing.md },
  statusCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  statusIcon: { borderRadius: 999, padding: 6 },
  statusLabel: { fontFamily: font.uiBold, fontSize: 11, color: color.textMuted },
  statusValue: { fontFamily: font.uiBold, fontSize: 13, marginTop: 2 },
  rowTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  rowMetaRow: { flexDirection: "row", gap: spacing.sm, marginTop: 2 },
  rowMeta: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  rowFaint: { fontFamily: font.ui, fontSize: 12, color: color.textFaint },
  outboxBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.orange500,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  outboxText: { fontFamily: font.uiBold, fontSize: 13, color: "#FFFFFF", flex: 1 },
});
