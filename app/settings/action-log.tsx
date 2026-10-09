import { useRef } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useOrgMessages } from "@/api/queries";
import type { ActionMessage } from "@/api/types";
import { ApiError } from "@/api/client";
import { Card, CenterMessage, Muted, Screen } from "@/components/common/ui";
import { formatJstDateTime } from "@/shared/date";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * アクションログ（操作履歴）。Web の /settings/log に対応する。
 *
 * 組織のメンバー全員の操作が新しい順に並ぶ。自分の行には「あなた」を出す。
 *
 * ⚠️ **ここに出るのはサーバが記録した分だけ。** 記録しているのは BFF の
 *    集金データの登録・編集・削除と、店舗の登録・編集・削除
 *    （`/api/v1/funds/*` `/api/v1/stores/*` が logAction を呼ぶ）。
 *    ⚠️ **在庫や設備の変更は記録していない。** 増やすときは BFF 側に
 *    logAction を足すこと。アプリから記録用の API を叩く作りにしないこと
 *    （文面を送れる＝ログを捏造できる経路になる）。
 *
 * ⚠️ **全件を一度に取らない。** ログは操作のたびに増えるので、範囲を切らないと
 *    PostgREST の 1000 行上限で古い順から黙って欠ける。
 */
export default function ActionLog() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlashListRef<ActionMessage>>(null);

  const { data, isLoading, isRefetching, refetch, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useOrgMessages();

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const isOffline = error instanceof ApiError && error.code === "OFFLINE";

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle}>アクションログ</Text>
        {/* 見出しを中央に置くための釣り合い */}
        <View style={styles.headerButton} />
      </View>

      {isLoading && !data ? (
        <CenterMessage text="読み込み中…" />
      ) : error && items.length === 0 ? (
        <CenterMessage
          text={
            isOffline
              ? "オフラインのため取得できませんでした"
              : error instanceof ApiError
                ? error.message
                : "操作履歴を取得できませんでした"
          }
        />
      ) : (
        <FlashList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isFetchingNextPage}
              onRefresh={refetch}
              tintColor={color.teal}
            />
          }
          ListHeaderComponent={
            items.length > 0 ? (
              <Muted style={styles.lead}>新しい操作が上に表示されます</Muted>
            ) : null
          }
          ListEmptyComponent={
            <Card>
              <Muted>まだアクションログがありません。</Muted>
            </Card>
          }
          renderItem={({ item }) => <LogRow item={item} />}
          /* 端まで来たら次のページ。⚠️ hasNextPage を見ないと最終ページで
             延々と再取得を投げる */
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? <Muted style={styles.footer}>読み込み中…</Muted> : null
          }
        />
      )}
    </Screen>
  );
}

function LogRow({ item }: { item: ActionMessage }) {
  return (
    <View style={styles.row}>
      <View style={styles.dot} />
      <View style={{ flex: 1 }}>
        <Text style={styles.message}>{item.message}</Text>
        <View style={styles.metaRow}>
          {/* ⚠️ date は epoch ミリ秒。null のことがある（古い行） */}
          <Text style={styles.date}>
            {typeof item.date === "number" && Number.isFinite(item.date)
              ? formatJstDateTime(item.date)
              : "日時不明"}
          </Text>
          <View style={[styles.badge, item.isMe ? styles.badgeMe : styles.badgeOther]}>
            <Ionicons
              name={item.isMe ? "person-circle-outline" : "people-outline"}
              size={12}
              color={item.isMe ? color.tealDeeper : color.textMuted}
            />
            <Text style={[styles.badgeLabel, item.isMe && styles.badgeLabelMe]}>
              {item.isMe ? "あなた" : (item.username ?? "他のユーザー")}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: color.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  headerButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: font.uiBold,
    fontSize: 17,
    color: color.textMain,
  },
  lead: { fontSize: 11, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: color.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  /* Web の Log.jsx と同じ、行頭の点 */
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: color.teal,
    marginTop: 5,
  },
  message: { fontFamily: font.ui, fontSize: 14, lineHeight: 21, color: color.textMain },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  date: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, flexShrink: 1 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeMe: { backgroundColor: color.tealPale },
  badgeOther: { backgroundColor: color.gray100 },
  badgeLabel: { fontFamily: font.uiBold, fontSize: 11, color: color.textMuted },
  badgeLabelMe: { color: color.tealDeeper },
  footer: { textAlign: "center", paddingVertical: spacing.md, fontSize: 12 },
});
