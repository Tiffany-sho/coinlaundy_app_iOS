import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/common/ui";
import { setupStyles, type SetupRole } from "@/components/setup/SetupParts";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";

/** 参加までの流れ。collecter だけに出す */
const JOIN_GUIDE = [
  { icon: "mail-outline" as const, text: "管理者のメールアドレスと組織パスワードを聞く" },
  { icon: "log-in-outline" as const, text: "次の画面で入力して組織に参加する" },
  { icon: "checkmark-outline" as const, text: "参加後に集金・管理ができるようになります" },
];

/** 初期設定の完了画面。役割で次にやることが変わるので中身を分ける */
export function FinishStep({ role, onDone }: { role: SetupRole; onDone: () => void }) {
  if (role === "admin") {
    return (
      <View style={{ gap: spacing.xl }}>
        <View style={setupStyles.centerBlock}>
          <View style={styles.finishIcon}>
            <Ionicons name="storefront-outline" size={36} color={color.teal} />
          </View>
          <Text style={styles.finishTitle}>はじめての店舗を追加してみましょう</Text>
          <Text style={setupStyles.lead}>店舗情報を登録して、管理を始めましょう</Text>
        </View>
        <Button label="ホームへ" variant="gradient" onPress={onDone} />
        <View style={styles.note}>
          {/*
            店舗の新規登録画面はアプリ側にまだない（設計図 7 章の対象外）。
            Web で登録した店舗はそのままアプリに出るので、その旨だけ伝える。
          */}
          <Text style={styles.noteText}>店舗の登録は Web から行えます</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={setupStyles.centerBlock}>
        <View style={styles.finishIconPale}>
          <Ionicons name="people-outline" size={32} color={color.teal} />
        </View>
        <Text style={styles.finishTitle}>初期設定が完了しました！</Text>
        {/*
          Web は「招待リンクが届いたらクリック」だけを案内しているが、
          アプリの参加画面は管理者のメール + 組織パスワードで参加する方式なので
          そちらを主に書く（メール招待も引き続き使える）。
        */}
        <Text style={setupStyles.lead}>続けて、管理者の組織に参加してください。</Text>
      </View>

      <View style={{ gap: spacing.md }}>
        {JOIN_GUIDE.map((row) => (
          <View key={row.text} style={styles.guideRow}>
            <View style={styles.guideIcon}>
              <Ionicons name={row.icon} size={15} color={color.teal} />
            </View>
            <Text style={styles.guideText}>{row.text}</Text>
          </View>
        ))}
      </View>

      <Button label="組織に参加する" variant="gradient" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  finishIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.xl,
    backgroundColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  finishIconPale: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: color.cyan100,
    alignItems: "center",
    justifyContent: "center",
  },
  finishTitle: { fontFamily: font.uiBold, fontSize: 18, color: color.gray800, textAlign: "center" },
  note: { backgroundColor: color.gray50, borderRadius: radius.lg, padding: spacing.lg },
  noteText: { fontFamily: font.ui, fontSize: 11, color: color.gray500, textAlign: "center" },
  guideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: color.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  guideIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: color.cyan100,
    alignItems: "center",
    justifyContent: "center",
  },
  guideText: { fontFamily: font.ui, fontSize: 13, color: color.gray700, flex: 1 },
});
