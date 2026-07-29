import { useCallback, useEffect, useRef, useState } from "react";
import { useIAP, getAvailablePurchases } from "expo-iap";
import type { Purchase, ProductSubscription } from "expo-iap";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { queryKeys } from "@/api/queries";
import { PRODUCT_ID_LIST, PRODUCT_IDS, type PurchasablePlan } from "@/billing/products";
import type { ApplePurchaseResult } from "@/api/types";

/**
 * アプリ内課金（自動更新サブスクリプション）の購入・復元。
 *
 * ⚠️ **iOS でしか呼ばないこと。** expo-iap は web に実装が無く、useIAP は購入イベントの
 *    購読を initConnection の try/catch の外で行うので、ネイティブモジュールが無い環境では
 *    useEffect から例外が投げられて画面ごと落ちる。呼び出し側は
 *    `src/components/settings/PlanPurchaseSection.tsx` だけ。
 *
 * ⚠️ **StoreKit の戻り値だけでプランを上げてはいけない。** 端末の中の話なので改造した
 *    端末からは自由に作れる。必ず purchaseToken（iOS では JWS）を BFF に送り、
 *    Apple のルート CA まで署名を辿って検証させる。正はサーバ。
 *
 * ⚠️ **検証が通ってから finishTransaction を呼ぶこと。** 先に閉じると StoreKit が
 *    その取引を「配送済み」として二度と返さなくなるので、検証に失敗したときに
 *    購入が宙に浮く（返金対応になる）。
 *
 * ⚠️ onPurchaseSuccess は自分が requestPurchase したときだけ来るとは限らない。
 *    アプリを閉じている間に完了した購入や、承認待ち（Ask to Buy）が通った購入も
 *    接続時にまとめて流れてくる。「購入ボタンを押した文脈」を前提にしないこと。
 */

export type PurchasePhase =
  | "idle"
  /** StoreKit の決済シートを出している */
  | "purchasing"
  /** 決済は終わり、サーバで検証している */
  | "verifying"
  | "restoring";

export type BillingError = {
  message: string;
  /** ユーザーが自分で閉じた場合。エラー表示を出さない */
  cancelled: boolean;
};

function toBillingError(e: unknown): BillingError {
  const code = (e as { code?: string })?.code ?? "";
  const message = (e as { message?: string })?.message ?? "";

  // 利用者がシートを閉じただけ。失敗として扱わない
  if (code === "user-cancelled" || code === "E_USER_CANCELLED") {
    return { message: "", cancelled: true };
  }
  if (code === "item-already-owned" || code === "E_ALREADY_OWNED") {
    return {
      message: "すでに購入済みです。「購入を復元」をお試しください。",
      cancelled: false,
    };
  }
  if (code === "network-error" || code === "E_NETWORK_ERROR") {
    return {
      message: "通信に失敗しました。電波の良い場所で再度お試しください。",
      cancelled: false,
    };
  }
  return {
    message: message || "購入処理に失敗しました。時間をおいて再度お試しください。",
    cancelled: false,
  };
}

export function useApplePurchase(orgId: string | null) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<PurchasePhase>("idle");
  const [error, setError] = useState<BillingError | null>(null);
  const [lastResult, setLastResult] = useState<ApplePurchaseResult | null>(null);

  /** 商品の取得は接続確立後に 1 回だけ */
  const fetchedRef = useRef(false);

  /**
   * useIAP の戻り。onPurchaseSuccess から finishTransaction を呼ぶために保持する。
   * ⚠️ useIAP の呼び出しより**前**に宣言しておくこと。後ろに置くと、
   *    コールバックが閉じ込める束縛が TDZ に入る。
   */
  const iapRef = useRef<ReturnType<typeof useIAP> | null>(null);

  /**
   * サーバ検証 → finishTransaction。
   * @param shouldFinish 購入は true。復元は false（既に完了済みの取引なので閉じない）
   */
  const settle = useCallback(
    async (purchase: Purchase, shouldFinish: boolean) => {
      const jws = purchase.purchaseToken;
      if (!jws) {
        setError({
          message: "購入情報を読み取れませんでした。サポートへお問い合わせください。",
          cancelled: false,
        });
        setPhase("idle");
        return;
      }

      setPhase("verifying");
      try {
        const result = await apiFetch<ApplePurchaseResult>("/billing/apple/verify", {
          method: "POST",
          body: { jws },
        });

        // サーバが受理した後で初めて取引を閉じる
        if (shouldFinish) {
          await iapRef.current?.finishTransaction({ purchase, isConsumable: false });
        }

        setLastResult(result);
        setError(null);
        // プランは bootstrap 経由で画面に出ている
        queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      } catch (e) {
        // finish していないので、次回起動時に StoreKit が再度届けてくれる
        setError({
          message:
            (e as { message?: string })?.message ??
            "購入の確認に失敗しました。アプリを再起動すると自動で再試行します。",
          cancelled: false,
        });
      } finally {
        setPhase("idle");
      }
    },
    [queryClient]
  );

  const settleRef = useRef(settle);
  settleRef.current = settle;

  const iap = useIAP({
    onPurchaseSuccess: (purchase) => {
      void settleRef.current(purchase, true);
    },
    onPurchaseError: (e) => {
      const next = toBillingError(e);
      setError(next.cancelled ? null : next);
      setPhase("idle");
    },
    onError: (e) => {
      setError(toBillingError(e));
    },
  });

  iapRef.current = iap;

  const { connected, subscriptions, fetchProducts } = iap;

  useEffect(() => {
    if (!connected || fetchedRef.current) return;
    fetchedRef.current = true;
    // ⚠️ type: "subs" を省くと自動更新サブスクが 1 件も返らない（in-app 扱いになる）
    void fetchProducts({ skus: PRODUCT_ID_LIST, type: "subs" });
  }, [connected, fetchProducts]);

  const buy = useCallback(
    async (plan: PurchasablePlan) => {
      setError(null);
      setPhase("purchasing");
      try {
        await iapRef.current?.requestPurchase({
          type: "subs",
          request: {
            apple: {
              sku: PRODUCT_IDS[plan],
              // ⚠️ 自動で finish させない。サーバ検証の前に閉じてしまう
              andDangerouslyFinishTransactionAutomatically: false,
              // 組織 ID を載せておくと、初回購入の通知が verify より先に届いても
              // サーバ側で組織を特定できる（orgId は uuid なのでそのまま使える）
              ...(orgId ? { appAccountToken: orgId } : {}),
            },
          },
        });
        // 成否は onPurchaseSuccess / onPurchaseError で受ける
      } catch (e) {
        const next = toBillingError(e);
        setError(next.cancelled ? null : next);
        setPhase("idle");
      }
    },
    [orgId]
  );

  /**
   * 購入の復元。機種変更やアプリの入れ直しで使う。
   * ⚠️ Apple は購入導線があるアプリに復元手段を必ず求める（Guideline 3.1.1）。
   */
  const restore = useCallback(async () => {
    setError(null);
    setPhase("restoring");
    try {
      // Apple ID と同期する。パスワード入力を求められることがある（復元では想定内）
      await iapRef.current?.restorePurchases();

      // ⚠️ useIAP が返す getAvailablePurchases は戻り値が void で、結果は
      //    availablePurchases の state に入る。**この関数の中では反映が間に合わない**ので、
      //    配列をその場で受け取れるモジュール側の関数を直接使う。
      const list = await getAvailablePurchases();

      const mine = (list ?? [])
        .filter((p) => PRODUCT_ID_LIST.includes(p.productId))
        // 新しいものを採用。ダウングレード直後は 2 件返ることがある
        .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0));

      if (mine.length === 0) {
        setError({ message: "復元できる購入が見つかりませんでした。", cancelled: false });
        setPhase("idle");
        return;
      }

      await settleRef.current(mine[0], false);
    } catch (e) {
      setError(toBillingError(e));
      setPhase("idle");
    }
  }, []);

  /** StoreKit が返した表示価格つきの商品。価格は必ずこちらを表示する */
  const productByPlan = (plan: PurchasablePlan): ProductSubscription | undefined =>
    subscriptions.find((s) => s.id === PRODUCT_IDS[plan]);

  return {
    connected,
    /** App Store から商品が 1 件も返らない状態。原因はほぼ App Store Connect 側の設定 */
    productsUnavailable: connected && subscriptions.length === 0,
    subscriptions,
    productByPlan,
    phase,
    busy: phase !== "idle",
    error,
    lastResult,
    clearError: () => setError(null),
    buy,
    restore,
  };
}
