import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { deepLinkToSubscriptions } from "expo-iap";
import { useApplePurchase } from "@/billing/useApplePurchase";
import { PURCHASABLE_PLANS } from "@/billing/products";
import { PlanOfferCard, SubscriptionDisclosure } from "@/components/settings/PlanCards";
import { useToast } from "@/components/common/toast";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { PlanSource } from "@/api/types";

/**
 * 購入導線。**iOS でだけマウントすること。**
 *
 * ⚠️ expo-iap は web / Android web に実装が無い（expo-module.config.json の platforms を参照）。
 *    useIAP は購入イベントの購読を initConnection の try/catch の**外**で行うので、
 *    ネイティブモジュールが無い環境では例外が useEffect から投げられて画面ごと落ちる。
 *    「Platform.OS で中身を出し分ける」だけでは足りない。**フック自体を走らせないこと。**
 *    そのためにこのコンポーネントに切り出してある（app/settings/plan.tsx を参照）。
 */
export function PlanPurchaseSection({
  currentPlan,
  planSource,
  orgId,
}: {
  currentPlan: string;
  planSource: PlanSource;
  orgId: string | null;
}) {
  const toast = useToast();
  const iap = useApplePurchase(orgId);

  useEffect(() => {
    if (iap.error?.message) toast.error(iap.error.message);
  }, [iap.error, toast]);

  useEffect(() => {
    if (iap.lastResult?.active) toast.success("プランを変更しました");
  }, [iap.lastResult, toast]);

  return (
    <>
      {iap.productsUnavailable && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            プランの情報を取得できませんでした。通信状況をご確認のうえ、時間をおいて再度お試しください。
          </Text>
        </View>
      )}

      {PURCHASABLE_PLANS.map((plan) => (
        <PlanOfferCard
          key={plan}
          plan={plan}
          product={iap.productByPlan(plan)}
          isCurrent={currentPlan === plan}
          disabled={!iap.connected || iap.busy}
          busy={iap.phase === "purchasing" || iap.phase === "verifying"}
          onPress={() => void iap.buy(plan)}
        />
      ))}

      <SubscriptionDisclosure />

      {/* ⚠️ 購入導線があるアプリには復元手段が必須（Guideline 3.1.1） */}
      <Pressable
        onPress={() => void iap.restore()}
        disabled={iap.busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.textButtonLabel}>
          {iap.phase === "restoring" ? "復元しています…" : "購入を復元"}
        </Text>
      </Pressable>

      {planSource === "apple" && (
        <Pressable
          onPress={() => void deepLinkToSubscriptions()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.textButtonLabel}>サブスクリプションを管理</Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: color.orange100,
    borderWidth: 1,
    borderColor: color.orange200,
  },
  noticeText: { fontFamily: font.ui, fontSize: 12, color: "#7C2D12", lineHeight: 18 },
  textButton: {
    marginTop: spacing.lg,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  textButtonLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.teal },
});
