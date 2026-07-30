import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap } from "@/api/queries";
import { CurrentPlanCard } from "@/components/settings/PlanCards";
import { PlanPurchaseSection } from "@/components/settings/PlanPurchaseSection";
import { CenterMessage, Muted, Screen, Title } from "@/components/common/ui";
import { color, font, spacing } from "@/theme/tokens";

/**
 * プランの購入・変更。
 *
 * ⚠️ **アプリから購入できるのは App Store のアプリ内課金だけ。**
 *    「Web サイトで契約できます」等の**言及**も Guideline 3.1.3(a) の
 *    リジェクト事由になる。他の決済手段を想起させる文言を置かないこと。
 *
 * ⚠️ 解約はアプリ側では行えない。iOS の購読管理を開くだけ。
 *    「解約する」ボタンを自前で作らないこと（押しても何も起きない）。
 *
 * ⚠️ 購入部分を PlanPurchaseSection に切り出してあるのは見た目の都合ではない。
 *    expo-iap は web に実装が無く、フックを走らせた時点で落ちるため
 *    **iOS 以外ではマウントしない**必要がある。ここで条件分岐をやめないこと。
 */
export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bootstrap = useBootstrap();

  if (bootstrap.isLoading && !bootstrap.data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  const plan = bootstrap.data?.plan ?? null;
  const isAdmin = plan?.myRole === "admin";
  const currentPlan = plan?.plan ?? "free";

  /**
   * ⚠️ Apple 以外で契約している組織にアプリから購入させない。二重に引き落とされたうえ、
   *    Apple 側の購読はアプリからも Web からも解約できない。
   *    判定の正はサーバ（applyAppleTransaction が 409 を返す）で、ここは出し分けだけ。
   */
  const lockedByOtherSource = plan?.planSource != null && plan.planSource !== "apple";

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

        <Title style={{ fontSize: 22, marginBottom: spacing.lg }}>プラン</Title>

        <CurrentPlanCard
          plan={currentPlan}
          storeCount={plan?.storeCount ?? 0}
          storeLimit={plan?.storeLimit ?? null}
          expiresAt={plan?.appleExpiresAt ?? null}
          trialEndsAt={plan?.trialEndsAt ?? null}
        />

        {!isAdmin ? (
          <Muted style={{ marginTop: spacing.lg }}>プランの変更は管理者のみ行えます。</Muted>
        ) : lockedByOtherSource ? (
          <Muted style={{ marginTop: spacing.lg }}>
            このプランはこの端末からは変更できません。
          </Muted>
        ) : Platform.OS !== "ios" ? (
          // ブラウザ確認時と Android。StoreKit が無いので購入導線を出さない
          <Muted style={{ marginTop: spacing.lg }}>
            プランの変更は iPhone アプリから行えます。
          </Muted>
        ) : (
          <PlanPurchaseSection
            currentPlan={currentPlan}
            planSource={plan?.planSource ?? null}
            orgId={plan?.orgId ?? null}
          />
        )}

        {/* Guideline 3.1.2 が求める規約・プライバシーへの導線 */}
        <View style={styles.legalRow}>
          <Pressable onPress={() => router.push("/settings/legal?page=terms" as Href)} hitSlop={8}>
            <Text style={styles.legalLink}>利用規約</Text>
          </Pressable>
          <Text style={styles.legalSep}>・</Text>
          <Pressable
            onPress={() => router.push("/settings/legal?page=privacy" as Href)}
            hitSlop={8}
          >
            <Text style={styles.legalLink}>プライバシーポリシー</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  backLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.teal },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
    gap: 4,
  },
  legalLink: {
    fontFamily: font.ui,
    fontSize: 12,
    color: color.textMuted,
    textDecorationLine: "underline",
  },
  legalSep: { fontFamily: font.ui, fontSize: 12, color: color.textFaint },
});
