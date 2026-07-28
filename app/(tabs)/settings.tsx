import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap } from "@/api/queries";
import { useAuth } from "@/auth/AuthProvider";
import { Button, ListCard, ListRow, Muted, Screen, Title } from "@/components/common/ui";
import { color, font, spacing } from "@/theme/tokens";

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

  async function onSignOut() {
    await signOut();
    router.replace("/welcome");
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: spacing.xxl,
        }}
      >
        <Title style={{ marginBottom: spacing.lg, fontSize: 22 }}>設定</Title>

        {/* Web の AccountInfoCard はアバターを大きく出す */}
        <View style={styles.avatarRow}>
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
        </View>

        <ListCard icon="person-outline" title="アカウント">
          <InfoRow label="表示名" value={data?.profile?.username ?? "—"} />
          <InfoRow label="メールアドレス" value={data?.user.email ?? "—"} />
          <InfoRow
            label="権限"
            value={data?.organization ? (ROLE_LABEL[data.organization.myRole] ?? "—") : "—"}
            last
          />
        </ListCard>

        <View style={{ marginTop: spacing.lg }}>
          <ListCard icon="people-outline" title="組織">
            <InfoRow label="組織名" value={data?.organization?.name ?? "未所属"} />
            <LinkRow
              label="メンバーを管理"
              onPress={() => router.push("/settings/organization")}
            />
            <LinkRow
              label="集金スケジュール"
              onPress={() => router.push("/settings/collect-schedule")}
              last
            />
          </ListCard>
        </View>

        {/*
          プランは read-only 表示のみ。
          ⚠️ アップグレードボタン・価格・外部リンク・「Web で契約できます」等の文言は
             App Store Guideline 3.1.3(a) のリジェクト事由になるため絶対に足さないこと。
        */}
        <View style={{ marginTop: spacing.lg }}>
          <ListCard icon="card-outline" title="プラン">
            <InfoRow label="現在のプラン" value={PLAN_LABEL[data?.plan?.plan ?? ""] ?? "—"} />
            <InfoRow
              label="店舗数"
              value={
                data?.plan ? `${data.plan.storeCount} / ${data.plan.storeLimit ?? "無制限"}` : "—"
              }
              last
            />
          </ListCard>
        </View>

        {/*
          ⚠️ ここに出せるのはプライバシーポリシーだけ。

          Web の /terms は「Proプラン ¥780/月」「クレジットカードによる月次自動引き落とし」
          「解約はマイページの『プランを管理する』から」を、/tokushoho は販売価格と決済条件を、
          /help は「アップグレードができます」を含む。
          これらをアプリ内 WebView で表示すると Guideline 3.1.3(a)（外部購入への誘導）に触れる。

          リンクを戻すには、価格・決済・アップグレードへの言及を除いた
          アプリ専用ページ（例: /terms/app）を Web 側に用意すること。
        */}
        <View style={{ marginTop: spacing.lg }}>
          <ListCard icon="document-text-outline" title="その他">
            <LinkRow
              label="プライバシーポリシー"
              onPress={() => router.push("/settings/webview?page=privacy" as Href)}
              last
            />
          </ListCard>
        </View>

        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <Button label="サインアウト" variant="ghost" onPress={onSignOut} />
          {/* App Store Guideline 5.1.1(v)：アプリ内から削除を開始できること */}
          <Button
            label="アカウントを削除"
            variant="danger"
            onPress={() => router.push("/settings/delete-account")}
          />
        </View>

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

function LinkRow({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) {
  return (
    <ListRow last={last} onPress={onPress}>
      <Text style={styles.linkLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={color.cyan300} />
    </ListRow>
  );
}

const styles = StyleSheet.create({
  value: { fontFamily: font.ui, fontSize: 15, color: color.textMain, flexShrink: 1, textAlign: "right" },
  linkLabel: { fontFamily: font.ui, fontSize: 15, color: color.textMain },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginBottom: spacing.lg },
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
