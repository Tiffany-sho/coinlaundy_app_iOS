import { useEffect, useRef } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAnnouncements, useBootstrap } from "@/api/queries";
import { ApiError } from "@/api/client";
import {
  AnnouncementEmpty,
  AnnouncementRow,
} from "@/components/settings/AnnouncementList";
import {
  getLastSeenAt,
  latestPublishedAt,
  markAnnouncementsSeen,
  unreadSince,
} from "@/components/settings/announcementsRead";
import { Card, CenterMessage, Muted, Screen, Title } from "@/components/common/ui";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 開発者からのお知らせ。組織に関係なく全ユーザー共通。
 *
 * ⚠️ 投稿は Supabase の Table Editor から手で行う（管理画面は無い）。
 *    アプリからは読むだけで、書き込みの API も作っていない。
 *
 * ⚠️ **本文に価格・プラン・外部サイトのことを書かないこと**（Guideline 3.1.3(a)）。
 *    アプリを更新せずに文面を出せる作りなので、審査を通ったあとに違反文面を
 *    出せてしまう。運用ルールとして docs/contracts.md にも書いてある。
 */
export default function News() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } = useAnnouncements();

  /**
   * ⚠️ **既読にする前の線を最初の描画で写しておく。** 下の useEffect で線が最新へ動くので、
   *    そのまま参照すると開いた瞬間に全件が既読になり、「どれが新しかったか」の印が
   *    1 つも出なくなる。この画面にいる間はこの値で判定する。
   */
  const seenOnEnter = useRef<number | null>(null);
  if (seenOnEnter.current === null) seenOnEnter.current = getLastSeenAt();

  /**
   * 「新着」の印を出す下限。
   *
   * ⚠️ **登録より前のお知らせには印を付けない**（設定画面のバッジと同じ規約）。
   *    片方だけ直すと「バッジは 0 なのに一覧には新着の印が残る」ずれ方をする。
   * ⚠️ 既読の線だけ ref で凍らせ、登録時刻は毎回読む。あちらは
   *    この画面にいる間に動くが、登録時刻はアカウントの固定値なので凍らせる必要が無い
   *    （bootstrap が後から届いても正しい向きにしか動かない）。
   */
  const bootstrap = useBootstrap();
  const since = unreadSince(seenOnEnter.current, bootstrap.data?.user?.createdAt);

  /**
   * 開いたら既読にする。
   * ⚠️ 「今」ではなく**一番新しいお知らせの公開日時**を線にする。now を入れると、
   *    直後に過去日で投稿されたお知らせが未読にならない。
   */
  const latest = latestPublishedAt(data);
  useEffect(() => {
    if (latest > 0) markAnnouncementsSeen(latest);
  }, [latest]);

  const isOffline = error instanceof ApiError && error.code === "OFFLINE";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing.xxl,
        }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={color.teal} />
        }
      >
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={color.teal} />
          <Text style={styles.backLabel}>戻る</Text>
        </Pressable>

        <Title style={{ fontSize: 22, marginBottom: spacing.xs }}>開発者からのお知らせ</Title>
        <Muted style={{ marginBottom: spacing.lg }}>
          新機能や不具合の対応状況をお知らせします
        </Muted>

        {isLoading && !data ? (
          <CenterMessage text="読み込み中…" />
        ) : error && !data ? (
          <Card>
            <Muted>
              {isOffline
                ? "オフラインのためお知らせを表示できません。通信できる場所で開き直してください。"
                : error instanceof ApiError
                  ? error.message
                  : "お知らせを取得できませんでした"}
            </Muted>
          </Card>
        ) : (data?.length ?? 0) === 0 ? (
          <AnnouncementEmpty />
        ) : (
          data!.map((item, i) => (
            <AnnouncementRow
              key={item.id}
              item={item}
              unread={item.publishedAt > since}
              /* 先頭だけ開いて出す。全部閉じていると何も読めない画面になる */
              defaultOpen={i === 0}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  backLabel: { fontFamily: font.ui, fontSize: 15, color: color.teal },
});
