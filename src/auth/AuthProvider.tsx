import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, startSessionAutoRefresh } from "@/api/supabase";
import { queryClient } from "@/api/queryClient";
import { unregisterPushToken } from "@/push/pushToken";

type AuthState = {
  session: Session | null;
  /** SecureStore からの復元が終わるまで true。スプラッシュを出したままにする */
  isRestoring: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /**
   * 新規登録。Supabase の mailer_autoconfirm が有効な間は
   * この時点でセッションが張られる（needsEmailConfirmation: false）。
   * 後からメール確認を有効にすると session が null で返るので、その分岐も残してある。
   */
  signUpWithPassword: (
    email: string,
    password: string
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setIsRestoring(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // 別ユーザーのデータが残らないようにキャッシュを捨てる
      if (event === "SIGNED_OUT") queryClient.clear();
    });

    const stopAutoRefresh = startSessionAutoRefresh();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      stopAutoRefresh();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      isRestoring,
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(toJapaneseAuthError(error.message));
      },
      async signUpWithPassword(email, password) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(toJapaneseSignUpError(error.message));
        return { needsEmailConfirmation: !data.session };
      },
      async signOut() {
        // ⚠️ サインアウトの「前」に外すこと。後にすると access_token が失効していて
        //    401 になり、device_tokens に行が残る。残った行に通知を送ると、
        //    同じ端末を引き継いだ別のユーザーに前の組織の集金予定が届く。
        await unregisterPushToken();
        await supabase.auth.signOut();
        queryClient.clear();
      },
    }),
    [session, isRestoring]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth は AuthProvider の内側で呼ぶこと");
  return ctx;
}

/** Supabase の英語メッセージをそのまま現場に出さない */
function toJapaneseAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) {
    return "メールアドレスまたはパスワードが違います";
  }
  if (message.includes("Email not confirmed")) {
    return "メールアドレスの確認が完了していません";
  }
  if (message.includes("network") || message.includes("Failed to fetch")) {
    return "通信できませんでした。電波状況を確認してください";
  }
  return "ログインに失敗しました";
}

/**
 * 新規登録のエラー文言。
 * ⚠️ Web の signup サーバーアクション（auth/actions.js）と同じ文言に揃えてある。
 *    片方だけ変えないこと。
 */
function toJapaneseSignUpError(message: string): string {
  const msg = message?.toLowerCase() ?? "";
  if (msg.includes("already registered") || msg.includes("user already exists")) {
    return "このメールアドレスはすでに登録されています。ログイン画面からログインしてください。";
  }
  if (msg.includes("rate limit") || msg.includes("email rate")) {
    return "しばらく時間をおいてから再度お試しください。";
  }
  if (msg.includes("invalid email") || msg.includes("valid email")) {
    return "有効なメールアドレスを入力してください。";
  }
  if (msg.includes("password")) {
    return "パスワードは英数字を含む8文字以上で入力してください。";
  }
  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return "通信できませんでした。電波状況を確認してください";
  }
  return "エラーが発生しました。もう一度お試しください。";
}
