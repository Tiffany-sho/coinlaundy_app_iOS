import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProductSubscription } from "expo-iap";
import { Card, Muted } from "@/components/common/ui";
import { PLAN_LABEL, PLAN_STORE_LIMIT, type PurchasablePlan } from "@/billing/products";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";

/**
 * プラン画面の見た目。データ取得と購入の実行は app/settings/plan.tsx が持つ。
 *
 * ⚠️ 価格を文字列で持たないこと。表示するのは StoreKit が返した displayPrice だけ。
 *    ハードコードすると地域・為替・Apple の価格改定で実際の請求額とずれ、
 *    Guideline 3.1.2（購読の内容を正しく開示すること）に触れる。
 */

const FEATURES: Record<string, string[]> = {
  free: ["店舗 3 件まで", "集金の記録と売上の集計"],
  pro: ["店舗 5 件まで", "集金の記録と売上の集計", "メンバーの招待"],
  max: ["店舗数の上限なし", "集金の記録と売上の集計", "メンバーの招待"],
};

export function CurrentPlanCard({
  plan,
  storeCount,
  storeLimit,
  expiresAt,
  trialEndsAt,
}: {
  plan: string;
  storeCount: number;
  storeLimit: number | null;
  expiresAt: string | null;
  trialEndsAt: string | null;
}) {
  return (
    <Card>
      <Text style={styles.currentLabel}>現在のプラン</Text>
      <Text style={styles.currentPlan}>{PLAN_LABEL[plan] ?? plan}</Text>

      <View style={styles.currentRow}>
        <Text style={styles.rowLabel}>店舗数</Text>
        <Text style={styles.rowValue}>
          {storeCount} / {storeLimit ?? "無制限"}
        </Text>
      </View>

      {trialEndsAt && (
        <View style={styles.currentRow}>
          <Text style={styles.rowLabel}>無料期間</Text>
          <Text style={styles.rowValue}>{formatDate(trialEndsAt)} まで</Text>
        </View>
      )}

      {expiresAt && (
        <View style={styles.currentRow}>
          <Text style={styles.rowLabel}>次回更新日</Text>
          <Text style={styles.rowValue}>{formatDate(expiresAt)}</Text>
        </View>
      )}
    </Card>
  );
}

export function PlanOfferCard({
  plan,
  product,
  isCurrent,
  disabled,
  busy,
  onPress,
}: {
  plan: PurchasablePlan;
  /** StoreKit から取れていないときは undefined。価格を出さずボタンも押させない */
  product: ProductSubscription | undefined;
  isCurrent: boolean;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const limit = PLAN_STORE_LIMIT[plan];
  const unavailable = product === undefined;

  return (
    <Card style={[styles.offer, isCurrent && styles.offerCurrent]}>
      <View style={styles.offerHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.offerName}>{PLAN_LABEL[plan]}</Text>
          <Muted style={{ fontSize: 12 }}>
            {limit === null ? "店舗数の上限なし" : `店舗 ${limit} 件まで`}
          </Muted>
        </View>
        {isCurrent && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>利用中</Text>
          </View>
        )}
      </View>

      {unavailable ? (
        <Muted style={{ fontSize: 12, marginTop: spacing.sm }}>
          価格を取得できませんでした
        </Muted>
      ) : (
        <View style={styles.priceRow}>
          <Text style={styles.price}>{product.displayPrice}</Text>
          <Text style={styles.pricePeriod}>／ 月</Text>
        </View>
      )}

      <View style={styles.features}>
        {(FEATURES[plan] ?? []).map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={15} color={color.teal} />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={onPress}
        disabled={disabled || unavailable || isCurrent || busy}
        accessibilityRole="button"
        accessibilityLabel={`${PLAN_LABEL[plan]} を購入する`}
        style={({ pressed }) => [
          styles.buyButton,
          (disabled || unavailable || isCurrent) && styles.buyButtonDisabled,
          pressed && { opacity: 0.8 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.buyLabel}>
            {isCurrent ? "利用中のプランです" : `${PLAN_LABEL[plan]} にする`}
          </Text>
        )}
      </Pressable>
    </Card>
  );
}

/** 購読の内容の開示。Guideline 3.1.2 が求める項目をここにまとめる */
export function SubscriptionDisclosure() {
  return (
    <View style={styles.disclosure}>
      <Text style={styles.disclosureText}>
        購読は月額の自動更新です。期間終了の 24 時間以上前に解約しない限り自動的に更新され、
        更新の 24 時間前に当該期間ぶんの料金が請求されます。購読の管理と自動更新の停止は、
        購入後に iPhone の「設定」＞「サブスクリプション」から行えます。
      </Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  // ⚠️ 解析できない値を new Date に渡すと "Invalid Date" が画面に出る
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

const styles = StyleSheet.create({
  currentLabel: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  currentPlan: {
    fontFamily: font.uiBold,
    fontSize: 26,
    color: color.tealDeeper,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  currentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  rowLabel: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
  rowValue: { ...numeric, fontSize: 14, color: color.textMain },

  offer: { marginTop: spacing.md },
  offerCurrent: { borderWidth: 2, borderColor: color.cyan200 },
  offerHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  offerName: { fontFamily: font.uiBold, fontSize: 18, color: color.textMain },
  badge: {
    backgroundColor: color.tealPale,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: font.uiBold, fontSize: 11, color: color.tealDeeper },

  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: spacing.md, gap: 4 },
  price: { ...numeric, fontSize: 28, color: color.tealDeeper },
  pricePeriod: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },

  features: { marginTop: spacing.md, gap: spacing.xs },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  featureText: { fontFamily: font.ui, fontSize: 13, color: color.textMain },

  buyButton: {
    marginTop: spacing.lg,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: color.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  buyButtonDisabled: { backgroundColor: color.textFaint },
  buyLabel: { fontFamily: font.uiBold, fontSize: 15, color: "#FFFFFF" },

  disclosure: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: color.gray50,
    borderRadius: radius.md,
  },
  disclosureText: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, lineHeight: 17 },
});
