import { useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/common/ui";
import { Field, FormError, Input, RadioCardGroup } from "@/components/common/form";
import {
  InfoItem,
  SETUP_ROLE_LABEL,
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
        <Input
          tone="plain"
          value={fullname}
          onChangeText={setFullname}
          placeholder="山田 太郎"
        />
      </Field>
      <Field label="ユーザー名">
        <Input
          tone="plain"
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
        /* ⚠️ 白地に直接置く画面なので plain。既定の枠（divider）は 1.07:1 で消える */
        tone="plain"
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
      {/*
        ⚠️ **表示名は他の画面と揃えること**（店舗管理者 / 集金担当者 / 閲覧者）。
           ここだけ「担当スタッフ」と呼んでいたので、設定画面やメンバー一覧と
           突き合わせたときに別の役割に見えていた。
        ⚠️ **閲覧者は 2026-08-05 に追加した。** それまで選択肢が 2 つしかなく、
           閲覧者として招かれた人が自分を集金担当者と申告するしかなかった。
      */}
      <RadioCardGroup
        /* ⚠️ 白地に直接置く画面なので plain。既定の枠（divider）は 1.07:1 で消える */
        tone="plain"
        label="あなたの役割を選んでください"
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
            title: "集金担当者",
            description: "担当する店舗の集金データを登録・閲覧できます",
          },
          {
            value: "viewer",
            title: "閲覧者",
            description: "担当する店舗のデータを閲覧できます。登録・編集はできません",
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
          tone="plain"
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

/**
 * 経費を記録するか（012）。**管理者のときだけ聞く。**
 *
 * ⚠️ **これは組織の設定。** 非管理者は他人が作った組織に入るので、聞いても
 *    自分では決められない（聞くと「選べたのに反映されない」ことになる）。
 *
 * ⚠️ **既定は「記録する」。** 経費を入れないと利益が出ないので、
 *    迷った人が使えるほうへ倒しておく。後から設定 → 組織で変えられる。
 */
export function ExpensesStep({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <View style={{ gap: spacing.xl }}>
      <View style={setupStyles.centerBlock}>
        <View style={setupStyles.circleIcon}>
          <Ionicons name="receipt-outline" size={28} color={color.teal} />
        </View>
        <Text style={setupStyles.lead}>
          家賃・仕入れなどの支出も記録すると、{"\n"}売上から引いた利益が出せます。
        </Text>
      </View>

      <RadioCardGroup
        /* ⚠️ 白地に直接置く画面なので plain。既定の枠（divider）は 1.07:1 で消える */
        tone="plain"
        label="経費を記録しますか？"
        hint="※設定後も変更できます"
        value={value ? "yes" : "no"}
        onChange={(v) => onChange(v === "yes")}
        items={[
          {
            value: "yes",
            title: "記録する",
            description: "収益ページに「月別利益」が出ます",
          },
          {
            value: "no",
            title: "記録しない",
            description: "売上だけを管理します",
          },
        ]}
      />
      <StepNav onBack={onBack} onNext={onNext} />
    </View>
  );
}

export function ConfirmStep({
  fullname,
  username,
  collectMethod,
  role,
  orgName,
  trackExpenses,
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
  trackExpenses: boolean;
  error: string | null;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  /*
    ⚠️ **三項演算子で「admin か、それ以外」と書かないこと。**
       閲覧者が「集金担当者」と表示され、確認画面で嘘をつくことになる
       （2026-08-05 まで実際にそうなっていた）。役割を足したらここも足す。
  */
  const roleLabel = SETUP_ROLE_LABEL[role];

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
      {/* ⚠️ 組織の設定なので admin のときだけ。非管理者には聞いていない */}
      {role === "admin" && (
        <InfoItem
          icon="receipt-outline"
          label="経費"
          value={trackExpenses ? "記録する" : "記録しない"}
          badge={trackExpenses ? "利益を出す" : "売上のみ"}
          badgeTone={trackExpenses ? "cyan" : "teal"}
        />
      )}

      {error && <FormError message={error} />}

      <StepNav onBack={onBack} onNext={onSubmit} nextLabel="登録" loading={submitting} />
    </View>
  );
}
