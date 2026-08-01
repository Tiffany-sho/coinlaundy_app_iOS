import { useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useScrollToTop, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAnnouncements, useBootstrap } from "@/api/queries";
import { Appear } from "@/components/common/Appear";
import { useUnreadAnnouncementCount } from "@/components/settings/announcementsRead";
import { useAuth } from "@/auth/AuthProvider";
import { Button, ListCard, ListRow, Muted, Screen, Title } from "@/components/common/ui";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";

/** Web の AccountInfoCard と同じ表記に合わせる */
const ROLE_LABEL: Record<string, string> = {
  admin: "店舗管理者",
  collecter: "集金担当者",
  viewer: "閲覧者",
};

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  max: "Max",
};

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { data } = useBootstrap();
  /** ⚠️ 既読は端末ローカル（MMKV）。機種変更やアプリの入れ直しでリセットされる */
  const announcements = useAnnouncements();
  const unreadNews = useUnreadAnnouncementCount(announcements.data);
  /** 設定タブをもう一度押したら先頭へ戻す */
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  async function onSignOut() {
    await signOut();
    router.replace("/welcome");
  }

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          padding: spacing.md,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: spacing.xxl,
        }}
      >
        {/* ⚠️ 上から順に index を振る。飛ばすと出る順が入れ替わって不自然に見える */}
        <Appear index={0}>
          <Title style={{ marginBottom: spacing.lg, fontSize: 22 }}>設定</Title>
        </Appear>

        {/*
          アカウントはこのカード 1 枚だけにする。
          ⚠️ 以前は同じ内容を「アバター行」と「アカウントカードのマイアカウント行」の
             2 か所に出していて役割が被っていた。増やし直さないこと。
             氏名・メール・権限はマイアカウント（app/settings/account/index.tsx）で見る。
        */}
        <Appear index={1}>
          <Pressable
            onPress={() => router.push("/settings/account")}
            accessibilityRole="button"
            style={({ pressed }) => [styles.accountCard, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.avatar}>
              {data?.profile?.avatar_url ? (
                <Image
                  source={{ uri: data.profile.avatar_url }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.avatarInitial}>
                  {(data?.profile?.username ?? "?").charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.avatarName}>{data?.profile?.username ?? "未設定"}</Text>
              <Muted>
                {data?.organization ? (ROLE_LABEL[data.organization.myRole] ?? "—") : "組織未所属"}
              </Muted>
            </View>
            <Ionicons name="chevron-forward" size={18} color={color.cyan300} />
          </Pressable>
        </Appear>

        <Appear index={2} style={{ marginTop: spacing.lg }}>
          <ListCard icon="people-outline" title="組織">
            <InfoRow label="組織名" value={data?.organization?.name ?? "未所属"} />
            <LinkRow
              label="メンバーを管理"
              onPress={() => router.push("/settings/organization")}
            />
            <LinkRow
              label="集金スケジュール"
              onPress={() => router.push("/settings/collect-schedule")}
            />
            {/* 誰がいつ何をしたかの履歴。組織のメンバー全員ぶんが出る */}
            <LinkRow
              label="アクションログ"
              onPress={() => router.push("/settings/action-log")}
              last
            />
          </ListCard>
        </Appear>

        <Appear index={3} style={{ marginTop: spacing.lg }}>
          <ListCard icon="notifications-outline" title="通知">
            <LinkRow
              label="通知の設定"
              onPress={() => router.push("/settings/notifications")}
              last
            />
          </ListCard>
        </Appear>

        {/*
          プランの変更はアプリ内課金（App Store）でのみ行う。

          ⚠️ 価格・外部リンク・「Web サイトで契約できます」等の**言及**は
             App Store Guideline 3.1.3(a) のリジェクト事由になる。
             価格を出してよいのは StoreKit の displayPrice を使うプラン画面だけで、
             ここには金額を書かないこと。
        */}
        <Appear index={4} style={{ marginTop: spacing.lg }}>
          <ListCard icon="card-outline" title="プラン">
            <InfoRow label="現在のプラン" value={PLAN_LABEL[data?.plan?.plan ?? ""] ?? "—"} />
            <InfoRow
              label="店舗数"
              value={
                data?.plan ? `${data.plan.storeCount} / ${data.plan.storeLimit ?? "無制限"}` : "—"
              }
            />
            <LinkRow
              label="プランを見る"
              onPress={() => router.push("/settings/plan")}
              last
            />
          </ListCard>
        </Appear>

        {/*
          規約・プライバシーは**アプリ内のテキスト**を描く（app/settings/legal.tsx）。
          2026-07-30 まではここから Web を WebView で開いていたが、静的なテキストなのに
          毎回サーバ生成されて 0.3〜1.0 秒かかっていたため取り込んだ。
          ⚠️ 引き換えに正本が 2 か所になっている。src/content/legal/types.ts を読むこと。

          ⚠️ 禁じられているのは**外部（Web・Stripe）での購入への誘導**であって、
             アプリ内課金の条件を書くことではない（Guideline 3.1.3(a) と 3.1.2）。
             利用規約の第5条・第6条は App Store 経由の購読を前提に入っている。
             ⚠️ ただし**価格を数字で書かない**こと。Web の /terms にある
             「Proプラン ¥780/月」等を持ち込まない（出してよいのは displayPrice だけ）。

          ⚠️ 特商法（/tokushoho）は載せない。販売価格と決済条件を必ず書く性質の文書で、
             Web の当該ページは Stripe 決済（当方が販売者）を前提に書かれている。
        */}
        <Appear index={5} style={{ marginTop: spacing.lg }}>
          <ListCard icon="document-text-outline" title="その他">
            <LinkRow
              label="開発者からのお知らせ"
              badge={unreadNews}
              onPress={() => router.push("/settings/news")}
            />
            {/* ⚠️ お知らせの本文が「ご意見は設定画面からお送りいただけます」と
                   案内しているので、この行を消さないこと（アプリに無い画面への誘導になる） */}
            <LinkRow
              label="ご意見・ご要望"
              onPress={() => router.push("/settings/feedback")}
            />
            <LinkRow
              label="利用規約"
              onPress={() => router.push("/settings/legal?page=terms" as Href)}
            />
            <LinkRow
              label="プライバシーポリシー"
              onPress={() => router.push("/settings/legal?page=privacy" as Href)}
              last
            />
          </ListCard>
        </Appear>

        <Appear index={6} style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <Button label="サインアウト" variant="ghost" onPress={onSignOut} />
          {/* App Store Guideline 5.1.1(v)：アプリ内から削除を開始できること */}
          <Button
            label="アカウントを削除"
            variant="danger"
            onPress={() => router.push("/settings/delete-account")}
          />
        </Appear>

        <Muted style={{ textAlign: "center", marginTop: spacing.xl }}>Collecie v1.0.0</Muted>
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <ListRow last={last}>
      <Muted>{label}</Muted>
      <Text style={styles.value}>{value}</Text>
    </ListRow>
  );
}

function LinkRow({
  label,
  onPress,
  last,
  badge,
}: {
  label: string;
  onPress: () => void;
  last?: boolean;
  /** 未読の件数。0 のときは何も出さない */
  badge?: number;
}) {
  return (
    <ListRow last={last} onPress={onPress}>
      <Text style={styles.linkLabel}>{label}</Text>
      <View style={styles.linkRight}>
        {badge != null && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>{badge}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={color.cyan300} />
      </View>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  value: { fontFamily: font.ui, fontSize: 15, color: color.textMain, flexShrink: 1, textAlign: "right" },
  linkLabel: { fontFamily: font.ui, fontSize: 15, color: color.textMain },
  linkRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  /* 未読の件数。⚠️ 2 桁でも丸くつぶれないよう最小幅を持たせる */
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: color.orange500,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabel: { fontFamily: font.uiBold, fontSize: 11, color: "#FFFFFF" },
  /* 他のカード（ui.tsx の Card）と同じ見え方に揃える。
     ⚠️ 影と角丸を同じ View に置いてよいのは overflow: "hidden" を付けないから。
        付けると iOS はビューの外側に影を描くので影が丸ごと消える（docs/traps.md） */
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    ...shadow.sm,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: color.cyan200,
    backgroundColor: color.tealPale,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontFamily: font.uiBold, fontSize: 24, color: color.tealDeeper },
  avatarName: { fontFamily: font.uiBold, fontSize: 18, color: color.textMain },
});
