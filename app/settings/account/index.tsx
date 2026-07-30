import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap } from "@/api/queries";
import { Button, CenterMessage, ListCard, ListRow, Muted, Screen, Title } from "@/components/common/ui";
import { color, font, spacing } from "@/theme/tokens";

/**
 * マイアカウント。
 *
 * 設定タブからアカウントの中身を追い出した先。設定タブは項目が多く、
 * 氏名・表示名・メール・権限まで並べると本来の「設定を探す」用途が埋もれる。
 *
 * ここは**見るだけ**で、編集は `./edit` に分けてある。
 */
export default function MyAccount() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading } = useBootstrap();

  if (isLoading && !data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  const profile = data?.profile;
  const organization = data?.organization;

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

        <Title style={{ fontSize: 22, marginBottom: spacing.lg }}>マイアカウント</Title>

        <View style={styles.avatarBlock}>
          <View style={styles.avatar}>
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Text style={styles.avatarInitial}>
                {(profile?.username ?? "?").charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={styles.avatarName}>{profile?.username ?? "未設定"}</Text>
          <Muted>{organization ? (ROLE_LABEL[organization.myRole] ?? "—") : "組織未所属"}</Muted>
        </View>

        <ListCard icon="person-outline" title="アカウント">
          <InfoRow label="氏名" value={profile?.full_name ?? "—"} />
          <InfoRow label="表示名" value={profile?.username ?? "—"} />
          <InfoRow label="メールアドレス" value={data?.user.email ?? "—"} last />
        </ListCard>

        <View style={{ marginTop: spacing.lg }}>
          <ListCard icon="people-outline" title="所属">
            <InfoRow label="組織名" value={organization?.name ?? "未所属"} />
            <InfoRow
              label="権限"
              value={organization ? (ROLE_LABEL[organization.myRole] ?? "—") : "—"}
              last
            />
          </ListCard>
        </View>

        <Button
          label="アカウント情報を編集"
          variant="gradient"
          onPress={() => router.push("/settings/account/edit")}
          style={{ marginTop: spacing.xl }}
        />

        {/* 変えられないものはここで断っておく。無いと「編集で直せるのか」を探しに行かせる */}
        <Muted style={styles.note}>
          メールアドレスは変更できません。権限の変更は組織の管理者に依頼してください。
        </Muted>
      </ScrollView>
    </Screen>
  );
}

/** Web の AccountInfoCard と同じ表記に合わせる */
const ROLE_LABEL: Record<string, string> = {
  admin: "店舗管理者",
  collecter: "集金担当者",
  viewer: "閲覧者",
};

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <ListRow last={last}>
      <Muted>{label}</Muted>
      <Text style={styles.value}>{value}</Text>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  backLabel: { fontFamily: font.ui, fontSize: 15, color: color.teal },
  avatarBlock: { alignItems: "center", gap: spacing.xs, marginBottom: spacing.xl },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: color.cyan200,
    backgroundColor: color.tealPale,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  avatarInitial: { fontFamily: font.uiBold, fontSize: 32, color: color.tealDeeper },
  avatarName: { fontFamily: font.uiBold, fontSize: 20, color: color.textMain },
  value: {
    fontFamily: font.ui,
    fontSize: 15,
    color: color.textMain,
    flexShrink: 1,
    textAlign: "right",
  },
  note: { fontSize: 11, marginTop: spacing.lg, textAlign: "center" },
});
