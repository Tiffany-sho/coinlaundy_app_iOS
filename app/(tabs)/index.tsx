import { useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useScrollToTop } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap, useHome, useMonthlySummary, queryKeys } from "@/api/queries";
import { useOutbox } from "@/offline/OutboxProvider";
import { usePushPriming } from "@/push/usePushPriming";
import { ApiError } from "@/api/client";
import { GreetingHeader } from "@/components/home/GreetingHeader";
import { Appear } from "@/components/common/Appear";
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

/** 「過去1ヶ月の集金記録」の初期表示件数。残りは「さらに表示」で開く */
const RECENT_STEP = 5;

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  /** 集金記録を何件まで出しているか。⚠️ 取得範囲ではなく表示量 */
  const [recentLimit, setRecentLimit] = useState(RECENT_STEP);
  /**
   * ホームタブをもう一度押したら先頭へ戻す。
   * ⚠️ 「今いる画面がそのタブの 1 枚目のとき」だけ動く（useScrollToTop の判定）。
   */
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

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

  /**
   * 設定を開く。**アプリで唯一の入口**（2026-08-03 にタブから外して経費と入れ替えた）。
   *
   * ⚠️ **組織未所属の分岐にも渡すこと。** そちらはタブがホーム 1 本だけで、
   *    **組織に参加する導線とサインアウトが設定の中にしか無い。**
   * ⚠️ `navigate` ではなく `push`。設定はタブではなくなったので、戻れる形で積む。
   */
  function openSettings() {
    router.push("/settings");
  }

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
          <GreetingHeader username={username} onOpenSettings={openSettings} />
          <Card style={{ marginTop: spacing.lg }}>
            <Muted>組織に所属すると、集金データや店舗の情報が表示されます。</Muted>
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  /**
   * ⚠️ BFF は過去 1 か月を**全件**返す（見出しどおりの範囲にするため）。
   *    ホームに全部並べると縦に長くなるので、ここで表示量だけ絞る。
   */
  const recent = home.data?.recentFunds ?? [];
  const visibleRecent = recent.slice(0, recentLimit);
  const remainingRecent = recent.length - visibleRecent.length;

  return (
    <Screen>
      {isOffline && <OfflineBanner />}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.lg }]}
        refreshControl={
          <RefreshControl
            refreshing={bootstrap.isRefetching || home.isRefetching}
            onRefresh={onRefresh}
            tintColor={color.teal}
          />
        }
      >
        {/* ⚠️ 上から順に index を振る。飛ばすと出る順が入れ替わって不自然に見える */}
        <Appear index={0}>
          <GreetingHeader
            username={username}
            schedule={bootstrap.data.collectSchedule}
            onOpenSettings={openSettings}
          />
        </Appear>

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
        <Appear index={1} style={{ marginTop: spacing.lg }}>
          <MonthlySalesCarousel
            data={monthly.data}
            isLoading={monthly.isLoading && !monthly.data}
            isError={Boolean(monthly.error)}
          />
        </Appear>

        {/* ⚠️ 集金日のカウントダウンはヘッダー（日付の隣）へ移した。ここに戻さないこと */}

        {/* ⚠️ 今日の対応状況をクイックアクションより先に出す（2026-07-30）。
               Web は逆順だが、アプリでは「まず今日どうなっているか」を見て
               そのあと操作を選ぶ流れにしてある。Web に合わせ直さないこと */}
        <Appear index={2} style={{ marginTop: spacing.xl }}>
          <SectionHeading>今日の対応状況</SectionHeading>
          <View style={styles.statusRow}>
            {/*
              ⚠️ **どちらのタブを開くかを必ず渡す。** 管理タブはタブバーの下で
                 マウントされたまま残るので、segment が前回のまま復活し
                 「在庫状況を押したのに設備が出る」ことになる（実際にこれで壊れていた）。
                 t は毎回変える値。同じ tab を続けて押しても params が変わらないと
                 受け側の効果が再実行されない。
              ⚠️ **push ではなく navigate。** push は同じ画面をスタックに積み増すので、
                 押した回数だけ戻る操作が要るようになる。navigate は既にある管理画面へ
                 戻って params だけ差し替える
            */}
            <StatusCard
              icon="cube-outline"
              label="在庫状況"
              count={home.data?.lowStockCount ?? 0}
              onPress={() =>
                router.navigate({ pathname: "/manage", params: { tab: "stock", t: Date.now() } })
              }
            />
            <StatusCard
              icon="construct-outline"
              label="設備状況"
              count={home.data?.brokenMachineCount ?? 0}
              onPress={() =>
                router.navigate({
                  pathname: "/manage",
                  params: { tab: "equipment", t: Date.now() },
                })
              }
            />
          </View>
        </Appear>

        <Appear index={3} style={{ marginTop: spacing.xl }}>
          <SectionHeading>クイックアクション</SectionHeading>
          <QuickActions myRole={bootstrap.data.organization.myRole} />
        </Appear>

        <Appear index={4} style={{ marginTop: spacing.xl }}>
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
              <>
                {visibleRecent.map((fund, i) => (
                  <ListRow
                    key={String(fund.id)}
                    last={i === visibleRecent.length - 1 && remainingRecent === 0}
                    onPress={() =>
                      router.push({ pathname: "/funds/[id]", params: { id: String(fund.id) } })
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{fund.laundryName}</Text>
                      <View style={styles.rowMetaRow}>
                        <Text style={styles.rowMeta}>{formatJstDate(fund.date)}</Text>
                        {fund.collecter && <Text style={styles.rowFaint}>{fund.collecter}</Text>}
                      </View>
                    </View>
                    <MoneyText value={fund.totalFunds} size={15} tone="deeper" />
                  </ListRow>
                ))}
                {remainingRecent > 0 && (
                  <ListRow last onPress={() => setRecentLimit((n) => n + RECENT_STEP)}>
                    <Text style={styles.moreText}>さらに表示（残り {remainingRecent} 件）</Text>
                    <Ionicons name="chevron-down" size={14} color={color.teal} />
                  </ListRow>
                )}
              </>
            )}
          </ListCard>
        </Appear>
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
    /* ⚠️ 縦の余白は 2 つのカードで必ず揃える。片方だけ変えると
          「問題なし」と「N店舗 要対応」で高さが違って段差が出る */
    paddingVertical: spacing.lg,
    minHeight: 76,
  },
  statusIcon: { borderRadius: 999, padding: 6 },
  statusLabel: { fontFamily: font.uiBold, fontSize: 11, color: color.textMuted },
  statusValue: { fontFamily: font.uiBold, fontSize: 13, marginTop: 2 },
  rowTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  rowMetaRow: { flexDirection: "row", gap: spacing.sm, marginTop: 2 },
  rowMeta: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  rowFaint: { fontFamily: font.ui, fontSize: 12, color: color.textFaint },
  moreText: { flex: 1, fontFamily: font.uiBold, fontSize: 13, color: color.teal },
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
