import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "@/api/client";
import { queryKeys } from "@/api/queries";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Screen } from "@/components/common/ui";
import { Field, FormError, Input, RadioCardGroup } from "@/components/common/form";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";

/**
 * 初回セットアップ。Web の WelcomeHome（feacher/home/components/WelcomeHome）を移植。
 *
 * Web と同じ 6 ステップ構成にしてある。
 *   1 ようこそ！ → 2 ユーザの情報登録 → 3 集金方法を設定 → 4 権限設定
 *   → (admin のみ) 5 組織の作成 → 設定内容確認 → 完了
 *
 * ⚠️ collectMethod に入れてよい値は "machines" / "total" の 2 つだけ。
 *    Web の useCollectMethod.js が `data.collectMethod === "machines"` で判定しているため、
 *    "machine" のような別表記を書き込むと Web 側が総額集金モードとして扱ってしまう。
 *
 * ⚠️ Apple サインインでメール非公開を選ばれると username が空になるため、
 *    ここでの表示名入力は必須（設計図 13.2）。
 */

type Role = "admin" | "collecter";
type CollectMethod = "machines" | "total";

export default function Setup() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

  const [step, setStep] = useState(1);
  const [fullname, setFullname] = useState("");
  const [username, setUsername] = useState("");
  const [collectMethod, setCollectMethod] = useState<CollectMethod>("machines");
  const [role, setRole] = useState<Role>("admin");
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.bootstrap,
        refetchType: "all",
      });
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
function getTitle(step: number, role: Role, isFinished: boolean): string {
  if (isFinished) return "初期設定が完了しました！";
  if (step === 1) return "ようこそ！";
  if (step === 2) return "ユーザの情報登録";
  if (step === 3) return "集金方法を設定";
  if (step === 4) return "権限設定";
  if (step === 5) return role === "admin" ? "組織の作成" : "設定内容確認";
  return "設定内容確認";
}

// ─── 各ステップ ──────────────────────────────────────────────

function StartStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={{ gap: spacing.xl }}>
      <Text style={styles.lead}>
        コインランドリーの集金・在庫・機器管理を{"\n"}スマホでかんたんに始めましょう。
      </Text>
      <Button label="初期設定を開始する" variant="gradient" onPress={onNext} />
    </View>
  );
}

function ProfileStep({
  fullname,
  username,
  setFullname,
  setUsername,
  onBack,
  onNext,
}: {
  fullname: string;
  username: string;
  setFullname: (v: string) => void;
  setUsername: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <View style={{ gap: spacing.lg }}>
      {msg && <FormError message={msg} />}
      <Field label="氏名">
        <Input value={fullname} onChangeText={setFullname} placeholder="山田 太郎" />
      </Field>
      <Field label="ユーザー名">
        <Input
          value={username}
          onChangeText={setUsername}
          placeholder="yamada_taro"
          autoCapitalize="none"
        />
      </Field>
      <StepNav
        onBack={onBack}
        onNext={() => {
          // Web と同じく両方必須
          if (!fullname.trim() || !username.trim()) {
            setMsg("空のフォームデータがあります");
            return;
          }
          setMsg(null);
          onNext();
        }}
      />
    </View>
  );
}

function MethodStep({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: CollectMethod;
  onChange: (v: CollectMethod) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <View style={{ gap: spacing.xl }}>
      <RadioCardGroup
        label="集金方法を選択してください"
        hint="※設定後も変更できます"
        value={value}
        onChange={onChange}
        items={[
          { value: "machines", title: "機械別集金", description: "それぞれの機械の収益を記録します" },
          { value: "total", title: "まとめて集金", description: "総額の収益のみを記録します" },
        ]}
      />
      <StepNav onBack={onBack} onNext={onNext} />
    </View>
  );
}

function RoleStep({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: Role;
  onChange: (v: Role) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <View style={{ gap: spacing.xl }}>
      <RadioCardGroup
        label="あなたは店舗管理者ですか？"
        value={value}
        onChange={onChange}
        items={[
          {
            value: "admin",
            title: "店舗管理者",
            description: "店舗の登録・設定など、すべての操作が行えます",
          },
          {
            value: "collecter",
            title: "担当スタッフ",
            description: "集金データの登録・閲覧が行えます",
          },
        ]}
      />
      <StepNav onBack={onBack} onNext={onNext} />
    </View>
  );
}

function OrgStep({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ alignItems: "center", gap: spacing.md }}>
        <View style={styles.orgIcon}>
          <Ionicons name="business-outline" size={28} color={color.teal} />
        </View>
        <Text style={styles.lead}>
          集金チームを管理する組織を作成します。{"\n"}後からスタッフを招待できます。
        </Text>
      </View>

      {msg && <FormError message={msg} />}

      <Field label="組織名（会社名・店舗グループ名など）">
        <Input
          value={value}
          onChangeText={(v) => {
            setMsg(null);
            onChange(v);
          }}
          placeholder="例：山田コインランドリー"
        />
      </Field>

      <StepNav
        onBack={onBack}
        onNext={() => {
          if (!value.trim()) {
            setMsg("組織名を入力してください");
            return;
          }
          onNext();
        }}
      />
    </View>
  );
}

function ConfirmStep({
  fullname,
  username,
  collectMethod,
  role,
  orgName,
  error,
  submitting,
  onBack,
  onSubmit,
}: {
  fullname: string;
  username: string;
  collectMethod: CollectMethod;
  role: Role;
  orgName: string;
  error: string | null;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const roleLabel = role === "admin" ? "店舗管理者" : "集金担当者";

  return (
    <View style={{ gap: spacing.md }}>
      <InfoItem icon="person-outline" label="氏名" value={fullname} />
      <InfoItem icon="at-outline" label="ユーザー名" value={username} />
      <InfoItem
        icon="wallet-outline"
        label="集金方法"
        value={collectMethod === "machines" ? "機械別集金" : "総額集金"}
        badge={collectMethod === "machines" ? "詳細" : "簡易"}
        badgeTone={collectMethod === "machines" ? "cyan" : "teal"}
      />
      <InfoItem
        icon={role === "admin" ? "ribbon-outline" : "checkmark-circle-outline"}
        label="役割"
        value={roleLabel}
        badge={roleLabel}
        badgeTone="cyan"
      />
      {role === "admin" && <InfoItem icon="business-outline" label="組織名" value={orgName} />}

      {error && <FormError message={error} />}

      <StepNav onBack={onBack} onNext={onSubmit} nextLabel="登録" loading={submitting} />
    </View>
  );
}

function FinishStep({ role, onDone }: { role: Role; onDone: () => void }) {
  if (role === "admin") {
    return (
      <View style={{ gap: spacing.xl }}>
        <View style={{ alignItems: "center", gap: spacing.md }}>
          <View style={styles.finishIcon}>
            <Ionicons name="storefront-outline" size={36} color={color.teal} />
          </View>
          <Text style={styles.finishTitle}>はじめての店舗を追加してみましょう</Text>
          <Text style={styles.lead}>店舗情報を登録して、管理を始めましょう</Text>
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
      <View style={{ alignItems: "center", gap: spacing.md }}>
        <View style={styles.finishIconPale}>
          <Ionicons name="people-outline" size={32} color={color.teal} />
        </View>
        <Text style={styles.finishTitle}>初期設定が完了しました！</Text>
        {/*
          Web は「招待リンクが届いたらクリック」だけを案内しているが、
          アプリの参加画面は管理者のメール + 組織パスワードで参加する方式なので
          そちらを主に書く（メール招待も引き続き使える）。
        */}
        <Text style={styles.lead}>
          続けて、管理者の組織に参加してください。
        </Text>
      </View>

      <View style={{ gap: spacing.md }}>
        {[
          { icon: "mail-outline" as const, text: "管理者のメールアドレスと組織パスワードを聞く" },
          { icon: "log-in-outline" as const, text: "次の画面で入力して組織に参加する" },
          { icon: "checkmark-outline" as const, text: "参加後に集金・管理ができるようになります" },
        ].map((row) => (
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

// ─── 部品 ────────────────────────────────────────────────────

function StepNav({
  onBack,
  onNext,
  nextLabel = "次へ",
  loading,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  loading?: boolean;
}) {
  return (
    <View style={styles.navRow}>
      <Button label="戻る" variant="ghost" onPress={onBack} style={{ flex: 1 }} />
      <Button
        label={nextLabel}
        variant="gradient"
        onPress={onNext}
        loading={loading}
        style={{ flex: 1 }}
      />
    </View>
  );
}

function InfoItem({
  icon,
  label,
  value,
  badge,
  badgeTone = "cyan",
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  badge?: string;
  badgeTone?: "cyan" | "teal";
}) {
  return (
    <View style={styles.infoItem}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={17} color={color.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || "未設定"}</Text>
      </View>
      {badge && (
        <View
          style={[
            styles.badge,
            { backgroundColor: badgeTone === "cyan" ? color.cyan100 : color.teal100 },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: badgeTone === "cyan" ? color.cyan800 : color.teal800 },
            ]}
          >
            {badge}
          </Text>
        </View>
      )}
    </View>
  );
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
  lead: {
    fontFamily: font.ui,
    fontSize: 13,
    color: color.textMuted,
    lineHeight: 22,
    textAlign: "center",
  },
  navRow: { flexDirection: "row", gap: spacing.md },
  orgIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    backgroundColor: color.cyan50,
    alignItems: "center",
    justifyContent: "center",
  },
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
  finishTitle: {
    fontFamily: font.uiBold,
    fontSize: 18,
    color: color.gray800,
    textAlign: "center",
  },
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
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: color.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.divider,
    padding: spacing.lg,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.cyan50,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginBottom: 2 },
  infoValue: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  badge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  badgeText: { fontFamily: font.uiBold, fontSize: 11 },
});
