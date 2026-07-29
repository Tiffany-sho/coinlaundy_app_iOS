import { useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/common/ui";
import { Field, FormError, Input, RadioCardGroup } from "@/components/common/form";
import {
  InfoItem,
  StepNav,
  setupStyles,
  type CollectMethod,
  type SetupRole,
} from "@/components/setup/SetupParts";
import { color, spacing } from "@/theme/tokens";

/**
 * 初回セットアップの各ステップ。Web の WelcomeHome と同じ順・同じ文言。
 *   1 ようこそ！ → 2 ユーザの情報登録 → 3 集金方法を設定 → 4 権限設定
 *   → (admin のみ) 5 組織の作成 → 設定内容確認
 * 完了画面だけ分量があるので FinishStep.tsx に分けてある。
 */

export function StartStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={{ gap: spacing.xl }}>
      <Text style={setupStyles.lead}>
        コインランドリーの集金・在庫・機器管理を{"\n"}スマホでかんたんに始めましょう。
      </Text>
      <Button label="初期設定を開始する" variant="gradient" onPress={onNext} />
    </View>
  );
}

/**
 * ⚠️ 氏名・ユーザー名とも必須（Web と同じ）。Apple サインインでメール非公開を選ばれると
 *    username が空のままになるため、ここで必ず入れさせる（設計図 13.2）。
 */
export function ProfileStep({
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

export function MethodStep({
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
          {
            value: "machines",
            title: "機械別集金",
            description: "それぞれの機械の収益を記録します",
          },
          { value: "total", title: "まとめて集金", description: "総額の収益のみを記録します" },
        ]}
      />
      <StepNav onBack={onBack} onNext={onNext} />
    </View>
  );
}

export function RoleStep({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: SetupRole;
  onChange: (v: SetupRole) => void;
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

export function OrgStep({
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
      <View style={setupStyles.centerBlock}>
        <View style={setupStyles.circleIcon}>
          <Ionicons name="business-outline" size={28} color={color.teal} />
        </View>
        <Text style={setupStyles.lead}>
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

export function ConfirmStep({
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
  role: SetupRole;
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
