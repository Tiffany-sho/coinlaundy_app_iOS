import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProductSubscription } from "expo-iap";
import { Card, Muted } from "@/components/common/ui";
import { PLAN_LABEL, PLAN_STORE_LIMIT, type PurchasablePlan } from "@/billing/products";
import { freeTrialLabel } from "@/billing/introOffer";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";

/**
 * プラン画面の見た目。データ取得と購入の実行は app/settings/plan.tsx が持つ。
 *
 * ⚠️ 価格を文字列で持たないこと。表示するのは StoreKit が返した displayPrice だけ。
 *    ハードコードすると地域・為替・Apple の価格改定で実際の請求額とずれ、
 *    Guideline 3.1.2（購読の内容を正しく開示すること）に触れる。
 */

/**
 * カードに並べる機能。
 *
 * ⚠️ **店舗数をここに書かないこと。** カードの見出し直下で PLAN_STORE_LIMIT から
 *    別に出しているので、2026-08-03 まで**同じ行が 1 枚に 2 回**出ていた。
 *    そのうえ数値が二重管理で、片方だけ直すと食い違う。
 *
 * ⚠️ **実際に出し分けている機能を落とさないこと。** 書き出しは
 *    `planAtLeast(plan, "pro")` で止めていて（ExportSheet.tsx）Pro 以上の
 *    実在する差なのに、ここに無いため Free と Pro の違いが店舗数だけに見えていた。
 *
 * ⚠️ 裏付けの無い項目（「優先サポート」など）を足さないこと。Web の料金表では
 *    Max にだけ書かれていて、提供実態も無く 2 つの表が矛盾していた。
 */
const FREE_FEATURES = ["集金の記録と売上の集計", "在庫・機器の管理"];

/**
 * ⚠️ **有料プランの中身は 3 つとも同じ。** 差は店舗数だけ、というのが実態なので
 *    1 つの配列を共有する。プランごとに書き分けると、片方にだけ足して
 *    「Pro+ にだけ機能が無い」表になる。
 */
const PAID_FEATURES = [
  ...FREE_FEATURES,
  "データの書き出し（CSV / Excel）",
  "メンバーの招待",
];

const FEATURES: Record<string, string[]> = {
  // free は購入カードに出ないが、有料との差を読めるように残してある
  free: FREE_FEATURES,
  pro: PAID_FEATURES,
  proplus: PAID_FEATURES,
  max: PAID_FEATURES,
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
  /*
    ⚠️ **StoreKit が返したときだけ出す。** 導入オファーは購読グループ単位で 1 回なので、
       既に別のプランで試した Apple ID には返って来ない。「Pro には必ず無料期間が付く」
       と決め打ちで書くと、**受けられない人にも無料と表示される。**
  */
  /*
    ⚠️ **`as` で潰さないこと。** `ProductSubscription` は iOS / Android の union で、
       Android 側に `subscriptionInfoIOS` が無い。`in` で絞れば iOS 側だけが残るので、
       期待する形が来ていることを型が保証したまま渡せる。
  */
  const trial = freeTrialLabel(
    product && "subscriptionInfoIOS" in product ? product : undefined
  );

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
          {/* ⚠️ 期間も文字列で持たない。App Store Connect で変えたら追随する */}
          {trial && (
            <View style={styles.trialBadge}>
              <Text style={styles.trialBadgeText}>{trial}</Text>
            </View>
          )}
        </View>
      )}

      {/* ⚠️ 無料期間の**終わり方**を必ず書く。書かないと「解約し忘れて課金された」に
             なり、Guideline 3.1.2 が求める開示にも足りない */}
      {trial && (
        <Muted style={styles.trialNote}>
          無料期間が終わると自動で更新されます。いつでも解約できます。
        </Muted>
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

  /* ⚠️ 長いトライアル表記でも折り返せるように wrap を許す（「12か月無料」等） */
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    marginTop: spacing.md,
    gap: 4,
  },
  price: { ...numeric, fontSize: 28, color: color.tealDeeper },
  pricePeriod: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
  trialBadge: {
    marginLeft: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: color.cyan50,
    borderWidth: 1,
    borderColor: color.cyan100,
  },
  trialBadgeText: { fontFamily: font.uiBold, fontSize: 11, color: color.tealDeeper },
  trialNote: { fontSize: 11, marginTop: spacing.xs },

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
