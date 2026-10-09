/**
 * 導入オファー（無料トライアル）の表示。
 *
 * ⚠️ **無料期間はアプリでは実装できない。** App Store Connect で購読商品に
 *    「導入オファー」を付けるもので、アプリにできるのは **StoreKit が返した内容を
 *    そのまま出すこと**だけ。付与も判定も Apple 側で行われる。
 *
 * ⚠️ **「6か月無料」を文字列で書かないこと。** 価格（`displayPrice`）と同じ理由で、
 *    App Store Connect で期間を変えた瞬間に**アプリの表示だけが古いまま**になる。
 *    Guideline 3.1.2 は購読の条件を正しく開示することを求めている。
 *
 * ⚠️ **導入オファーは購読グループ単位で 1 回。** Pro で試した人は Pro+ では
 *    受けられない。StoreKit は**その Apple ID が受けられるときだけ**
 *    `introductoryOffer` を返す（＝返って来なければ出さないのが正しい）。
 *    したがって「Pro には必ずトライアルが付く」という前提で画面を組まないこと。
 */

/** expo-iap の `SubscriptionOfferIOS` のうち、ここで使うぶんだけ */
export type IntroOffer = {
  paymentMode: string;
  /** 1 期間の長さ。⚠️ これ 1 つでは足りない（下の periodCount を必ず掛ける） */
  period: { unit: string; value: number };
  /** 期間の繰り返し回数 */
  periodCount: number;
  type: string;
};

/** expo-iap の `ProductSubscription` のうち、ここで使うぶんだけ */
export type ProductWithIntro = {
  subscriptionInfoIOS?: { introductoryOffer?: IntroOffer | null } | null;
};

const UNIT_LABEL: Record<string, string> = {
  day: "日間",
  week: "週間",
  month: "か月",
  year: "年",
};

/**
 * 「6か月無料」のような表示を組む。**無料トライアルでなければ null。**
 *
 * ⚠️ **`period.value` と `periodCount` を必ず掛ける。** 6 か月の無料期間は
 *    Apple の設定の仕方で `{month, 6} × 1` にも `{month, 1} × 6` にもなる。
 *    片方だけ見ると**「1か月無料」と表示して 6 か月無料で提供する**ことになり、
 *    実際の条件と食い違う（3.1.2）。
 *
 * ⚠️ **`paymentMode` を見る。** 導入オファーには「初回だけ割引」
 *    （`pay-as-you-go` / `pay-up-front`）もあり、それを「無料」と出すと
 *    課金が発生しているのに無料と書いたことになる。
 */
export function freeTrialLabel(product: ProductWithIntro | undefined): string | null {
  const offer = product?.subscriptionInfoIOS?.introductoryOffer;
  if (!offer) return null;
  if (offer.paymentMode !== "free-trial") return null;

  const unit = UNIT_LABEL[offer.period?.unit ?? ""];
  if (!unit) return null;

  const total = (offer.period?.value ?? 0) * (offer.periodCount ?? 0);
  // ⚠️ 0 や負を「0か月無料」と出さない。設定ミスなら黙って出さないほうがまし
  if (!Number.isFinite(total) || total <= 0) return null;

  return `${total}${unit}無料`;
}
