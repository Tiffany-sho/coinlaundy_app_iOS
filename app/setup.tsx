import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { queryKeys } from "@/api/queries";
import { useAuth } from "@/auth/AuthProvider";
import type { CollectMethod, SetupRole } from "@/components/setup/SetupParts";
import {
  ConfirmStep,
  ExpensesStep,
  MethodStep,
  OrgStep,
  ProfileStep,
  RoleStep,
  StartStep,
} from "@/components/setup/SetupSteps";
import { FinishStep } from "@/components/setup/FinishStep";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 初回セットアップ。Web の WelcomeHome（feacher/home/components/WelcomeHome）を移植。
 *
 * 各ステップの中身は components/setup/ にある。ここは進行と登録だけ。
 *   1 ようこそ！ → 2 ユーザの情報登録 → 3 集金方法を設定 → 4 権限設定
 *   → (admin のみ) 5 組織の作成 → 設定内容確認 → 完了
 *
 * ⚠️ **カードに載せない**（2026-08-05）。**純白の紙に直接置く**（`auth/AuthScreen`
 *    と同じ扱い）。ログイン → 新規登録 → **初期設定**は 1 本の流れなのに、
 *    ここだけ影付きのカード + その中の水色の面という二重の枠になっていて、
 *    同じアプリの別の画面に見えていた。
 *    ⚠️ **`color.appBg` の面を戻さない**（`inner`）。**teal / cyan を面で使わない。**
 *    ⚠️ **背景は `color.cardBg`（純白）を明示する。** ルートの Stack の
 *       `contentStyle` が `appBg` なので、省くと薄い水色が透ける。
 */
export default function Setup() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

  const [step, setStep] = useState(1);
  const [fullname, setFullname] = useState("");
  const [username, setUsername] = useState("");
  const [collectMethod, setCollectMethod] = useState<CollectMethod>("machines");
  const [role, setRole] = useState<SetupRole>("admin");
  const [orgName, setOrgName] = useState("");
  /**
   * 経費を記録するか（012）。⚠️ **admin のときだけ聞く**（組織の設定なので）。
   * ⚠️ 既定は true。迷った人が使えるほうへ倒しておく。
   */
  const [trackExpenses, setTrackExpenses] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    admin は「組織の作成」と「経費」が挟まるので確認画面が 2 つ後ろにずれる。
    ⚠️ **番号を直したら getTitle も直すこと。** 分岐が 2 か所に分かれているので、
       片方だけ直すと見出しと中身が 1 つずれる（型エラーは出ない）。
  */
  const confirmStep = role === "admin" ? 7 : 5;
  const isFinished = step > confirmStep;

  const next = () => setStep((s) => s + 1);
  const back = () => {
    setError(null);
    setStep((s) => s - 1);
  };

  async function register() {
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/profile", {
        method: "POST",
        body: { fullname, username, collectMethod, role },
      });
      if (role === "admin") {
        await apiFetch("/org", {
          method: "POST",
          /* ⚠️ 省略＝経費を使う。サーバも同じ既定なので、送り忘れても機能は消えない */
          body: { name: orgName.trim(), expensesEnabled: trackExpenses },
        });
      }
      // ⚠️ refetchType を省くと「古い」印を付けるだけで再取得しない。
      //    この画面は useBootstrap() を使っていないので bootstrap は非アクティブで、
      //    そのまま "/" へ移ると永続キャッシュの profile: null を読んで /setup へ戻される。
      //    await して新しい bootstrap を確実に載せてから次へ進む。
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap, refetchType: "all" });
      next();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        /* ⚠️ keyboardVerticalOffset は渡さない。この画面の上にネイティブの
              ヘッダは無いので、渡すとヘッダ分を二重に数えて余白が出る */
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text style={styles.title}>{getTitle(step, role, isFinished)}</Text>

            <View>
              {step === 1 && <StartStep onNext={next} />}
              {step === 2 && (
                <ProfileStep
                  fullname={fullname}
                  username={username}
                  setFullname={setFullname}
                  setUsername={setUsername}
                  onBack={back}
                  onNext={next}
                />
              )}
              {step === 3 && (
                <MethodStep
                  value={collectMethod}
                  onChange={setCollectMethod}
                  onBack={back}
                  onNext={next}
                />
              )}
              {step === 4 && (
                <RoleStep value={role} onChange={setRole} onBack={back} onNext={next} />
              )}
              {step === 5 && role === "admin" && (
                <OrgStep value={orgName} onChange={setOrgName} onBack={back} onNext={next} />
              )}
              {step === 6 && role === "admin" && (
                <ExpensesStep
                  value={trackExpenses}
                  onChange={setTrackExpenses}
                  onBack={back}
                  onNext={next}
                />
              )}
              {step === confirmStep && (
                <ConfirmStep
                  fullname={fullname}
                  username={username}
                  collectMethod={collectMethod}
                  role={role}
                  orgName={orgName}
                  trackExpenses={trackExpenses}
                  error={error}
                  submitting={submitting}
                  onBack={back}
                  onSubmit={register}
                />
              )}
              {isFinished && <FinishStep role={role} onDone={() => router.replace("/")} />}
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/*
        ⚠️ **画面の隅に置く**（2026-08-06）。それまでは各ステップの「次へ」の
           すぐ下に**全幅のボタン**として並んでいたので、**進めるつもりで
           押してしまう**位置だった（初期設定の途中で消えると最初からやり直しになる）。
        ⚠️ **ScrollView の外＝絶対配置にする。** 中に置くと、ステップごとに
           中身の高さが違うので**現れる位置が上下に動く。**
        ⚠️ **白い下地を敷く。** 内容が長いステップではスクロールした本文が
           この下を通るので、敷かないと文字が重なって読めなくなる
           （紙が純白なので下地そのものは見えない）。
        ⚠️ **完了後は出さない**（`isFinished`）。従来どおり。
      */}
      {!isFinished && (
        <Pressable
          onPress={async () => {
            await signOut();
            router.replace("/welcome");
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="サインアウト"
          style={[styles.signOut, { top: insets.top + spacing.xs }]}
        >
          <Ionicons name="log-out-outline" size={14} color={color.textFaint} />
          <Text style={styles.signOutLabel}>サインアウト</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Web の getTitle と同じ文言・同じ分岐 */
function getTitle(step: number, role: SetupRole, isFinished: boolean): string {
  if (isFinished) return "初期設定が完了しました！";
  if (step === 1) return "ようこそ！";
  if (step === 2) return "ユーザの情報登録";
  if (step === 3) return "集金方法を設定";
  if (step === 4) return "権限設定";
  if (step === 5) return role === "admin" ? "組織の作成" : "設定内容確認";
  // ⚠️ 6 は admin のときだけ「経費の記録」。非管理者はここまで来ない
  if (step === 6 && role === "admin") return "経費の記録";
  return "設定内容確認";
}

const styles = StyleSheet.create({
  /* ⚠️ appBg（#F0F9FF）ではなく純白。ルートの Stack の contentStyle が appBg なので、
        ここを省くと薄い水色が透ける（`auth/AuthScreen` と同じ理由） */
  root: { flex: 1, backgroundColor: color.cardBg },
  body: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  /* ⚠️ 色は tealDeeper ではなく textMain。ログイン・新規登録の見出しと揃えてある
        （teal を面ではなく文字で大きく使うと、そこだけシアン基調に見える） */
  title: {
    fontFamily: font.uiBold,
    fontSize: 26,
    color: color.textMain,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  /* ⚠️ `top` は insets を足して呼び出し側で決める（ノッチの有無で変わるため） */
  signOut: {
    position: "absolute",
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    backgroundColor: color.cardBg,
    borderRadius: radius.md,
  },
  signOutLabel: { fontFamily: font.ui, fontSize: 12, color: color.textFaint },
});
