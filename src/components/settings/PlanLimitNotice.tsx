import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * プランの上限を超えているときに理由を添える帯。店舗数とメンバー数で使う。
 *
 * ⚠️ **プランを下げても既存のものは外さない**（追加・承認だけ止める）ので、
 *    「5 / 3」のように上限を超えた状態は普通に起こる
 *    （contracts.md の「プランの制限」）。しかも失効の Server Notification で
 *    起きるため、**本人がアプリを開いていない間に超過が始まる。**
 *    次に開いたときこの帯が初めて事情を伝えるので、消さないこと。
 *
 * ⚠️ **外部サイトでの契約を匂わせない**（Guideline 3.1.3(a)）。
 *    どこで変更できるかは書かず、状態の説明に留める。
 */
export function PlanLimitNotice({
  limit,
  unit,
  blocked,
}: {
  /** 現在のプランの上限 */
  limit: number;
  /** 「店舗」「名」など、上限の数に付く単位 */
  unit: string;
  /** 超過中にできなくなること。例「新しい店舗は追加できません」 */
  blocked: string;
}) {
  return (
    <View style={styles.notice}>
      <Ionicons name="alert-circle-outline" size={15} color={color.orange500} />
      <Text style={styles.text}>
        現在のプランの上限は {limit}
        {unit}です。登録済みのぶんはこれまでどおりお使いいただけますが、{blocked}。
      </Text>
    </View>
  );
}

/** 超過しているか。⚠️ `>=` ではなく `>`（ちょうど上限は正常な状態） */
export function isOverLimit(count: number, limit: number | null | undefined): limit is number {
  return typeof limit === "number" && count > limit;
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: color.orange100,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  text: { flex: 1, fontFamily: font.ui, fontSize: 12, color: color.textMain, lineHeight: 18 },
});
