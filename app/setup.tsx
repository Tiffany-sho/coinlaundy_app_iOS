import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { queryKeys } from "@/api/queries";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Screen } from "@/components/common/ui";
import type { CollectMethod, SetupRole } from "@/components/setup/SetupParts";
import {
  ConfirmStep,
  MethodStep,
  OrgStep,
  ProfileStep,
  RoleStep,
  StartStep,
} from "@/components/setup/SetupSteps";
import { FinishStep } from "@/components/setup/FinishStep";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";

/**
 * 初回セットアップ。Web の WelcomeHome（feacher/home/components/WelcomeHome）を移植。
 *
 * 各ステップの中身は components/setup/ にある。ここは進行と登録だけ。
 *   1 ようこそ！ → 2 ユーザの情報登録 → 3 集金方法を設定 → 4 権限設定
 *   → (admin のみ) 5 組織の作成 → 設定内容確認 → 完了
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

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // admin は「組織の作成」が挟まるので確認画面が 1 つ後ろにずれる（Web と同じ）
  const confirmStep = role === "admin" ? 6 : 5;
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
        await apiFetch("/org", { method: "POST", body: { name: orgName.trim() } });
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
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.title}>{getTitle(step, role, isFinished)}</Text>

            <View style={styles.inner}>
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
              {step === confirmStep && (
                <ConfirmStep
                  fullname={fullname}
                  username={username}
                  collectMethod={collectMethod}
                  role={role}
                  orgName={orgName}
                  error={error}
                  submitting={submitting}
                  onBack={back}
                  onSubmit={register}
                />
              )}
              {isFinished && <FinishStep role={role} onDone={() => router.replace("/")} />}
            </View>
          </View>

          {!isFinished && (
            <Button
              label="サインアウト"
              variant="ghost"
              onPress={async () => {
                await signOut();
                router.replace("/welcome");
              }}
              style={{ marginTop: spacing.lg }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
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
  return "設定内容確認";
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  card: {
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    padding: spacing.xl,
    ...shadow.hero,
  },
  title: {
    fontFamily: font.uiBold,
    fontSize: 24,
    color: color.tealDeeper,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  inner: { backgroundColor: color.appBg, borderRadius: radius.xl, padding: spacing.lg },
});
