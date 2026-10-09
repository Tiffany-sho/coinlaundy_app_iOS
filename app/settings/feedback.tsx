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
import { useSendFeedback, type FeedbackType } from "@/api/queries";
import { errorMessage } from "@/components/funds/fundCache";
import { Field, Input, RadioCardGroup, type RadioItem } from "@/components/common/form";
import { useToast } from "@/components/common/toast";
import { Button, Card, Muted, Screen, Title } from "@/components/common/ui";
import { color, font, spacing } from "@/theme/tokens";

/**
 * ご意見・ご要望。Web の /settings/feedback（FeedbackForm）に対応する。
 *
 * ⚠️ **アプリに無い画面へ誘導していた穴を塞ぐためのもの。** 最初のお知らせに
 *    「ご意見は設定画面からお送りいただけます」と書いてあるのに、フィードバックの
 *    画面は Web にしか無かった（`docs/contracts.md` の「開発者からのお知らせ」）。
 *
 * ⚠️ **`mailto:` を置かない。** アプリの外へ出る導線になる（法務文書と同じ理由）。
 *    宛先はサーバが持っていて、アプリは本文と種類しか送らない。
 *
 * ⚠️ 送信内容はメール 1 通として運営者に届くだけで、DB にもアクションログにも残らない。
 */
const TYPES: RadioItem<FeedbackType>[] = [
  { value: "bug", title: "バグ報告", description: "うまく動かない・表示がおかしい" },
  { value: "feature", title: "機能の提案", description: "こんな機能があると助かる" },
  { value: "other", title: "その他", description: "感想や困っていることなど" },
];

/** ⚠️ サーバ側（sendFeedback）の上限と同じ値。片方だけ変えると黙って切られる */
const MAX_LENGTH = 2000;

export default function Feedback() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const send = useSendFeedback();

  const [type, setType] = useState<FeedbackType>("bug");
  const [description, setDescription] = useState("");

  const trimmed = description.trim();
  const canSubmit = trimmed.length > 0 && !send.isPending;

  async function onSubmit() {
    if (!canSubmit) return;
    try {
      await send.mutateAsync({ type, description: trimmed });
      /**
       * ⚠️ **トーストは `router.back()` の前に出す。** この画面は普通の Stack の
       *    1 枚なのでルートのトーストがそのまま見える（モーダルではない）。
       */
      toast.success("ご意見を送信しました。ありがとうございます");
      router.back();
    } catch (e) {
      toast.error(errorMessage(e, "送信できませんでした"));
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        /* ⚠️ keyboardVerticalOffset は渡さない。この画面の上にネイティブの
              ヘッダは無いので、渡すと帯状の余白が出る（docs/traps.md 参照） */
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingTop: insets.top + spacing.md,
            paddingBottom: spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={color.teal} />
            <Text style={styles.backLabel}>戻る</Text>
          </Pressable>

          <Title style={{ fontSize: 22, marginBottom: spacing.sm }}>ご意見・ご要望</Title>
          <Muted style={{ marginBottom: spacing.lg, fontSize: 13 }}>
            いただいた内容は開発者に直接届きます。返信が必要な場合はその旨をお書きください。
          </Muted>

          <Card>
            <RadioCardGroup
              label="種類"
              value={type}
              onChange={setType}
              items={TYPES}
            />

            <Field label="内容" style={{ marginTop: spacing.xl }}>
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder={
                  "具体的に教えていただけると助かります\n\n例）〇〇の画面で△△しようとすると、××というエラーが出ます"
                }
                multiline
                maxLength={MAX_LENGTH}
                textAlignVertical="top"
                style={styles.textarea}
              />
            </Field>

            {/* 上限に近づいたときだけ出す。常に出すと入力欄の下がうるさい */}
            {description.length > MAX_LENGTH - 200 && (
              <Muted style={styles.counter}>
                {description.length} / {MAX_LENGTH}
              </Muted>
            )}
          </Card>

          <Button
            label="送信する"
            variant="gradient"
            onPress={() => void onSubmit()}
            disabled={!canSubmit}
            loading={send.isPending}
            style={{ marginTop: spacing.xl }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  backLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.teal },
  /* ⚠️ multiline は高さを決めないと 1 行分しかなく、長文を書いている感じがしない */
  textarea: { minHeight: 150, paddingTop: spacing.md },
  counter: { marginTop: spacing.xs, fontSize: 11, textAlign: "right" },
});
