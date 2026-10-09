import { StyleSheet, Text, TextInput, View } from "react-native";
import { Muted } from "@/components/common/ui";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { PaymentMethod } from "@/api/types";

/**
 * キャッシュレス決済の入力欄。**その店舗の**支払方法が並ぶ。
 * 登録は店舗の登録・編集フォームの「支払方法」の節で行う（009 で店舗ごとになった）。
 *
 * ⚠️ **単位は「円」。** すぐ上の機種別入力は**硬貨の枚数**なので、
 *    同じ画面に単位の違う欄が並ぶ。ラベルの `¥` を消さないこと。
 *
 * ⚠️ **現金の欄は出さない。** 現金は機種別入力（または合計入力）そのもので、
 *    ここに欄を作ると同じ金額を 2 回入れることになる。
 *
 * ⚠️ **使用停止中の支払方法は渡さない**（呼び出し側で `isActive` で絞る）。
 *    過去の記録は残っているが、新しく選べてはいけない。
 */
export function CashlessInputs({
  methods,
  amounts,
  onChange,
}: {
  /** ⚠️ 使用中のものだけ。現金は含まない */
  methods: PaymentMethod[];
  /** methodId → 入力中の文字列（数字のみ）。空文字は未入力 */
  amounts: Record<string, string>;
  onChange: (methodId: string, digitsOnly: string) => void;
}) {
  if (methods.length === 0) {
    return (
      <Muted style={styles.empty}>
        店舗の編集画面で支払方法を登録すると、現金以外で受け取った金額もここに記録できます。
      </Muted>
    );
  }

  return (
    <>
      <Muted style={styles.lead}>
        現金以外で受け取ったぶんを入力します。受け取っていない方法は空欄のままで構いません。
      </Muted>

      {methods.map((method, index) => (
        <View key={method.id} style={index > 0 && styles.spaced}>
          <Text style={styles.methodName}>{method.name}</Text>
          <View style={styles.inputGroup}>
            <View style={styles.addon}>
              <Text style={styles.addonText}>¥</Text>
            </View>
            <TextInput
              style={styles.input}
              value={amounts[method.id] ?? ""}
              onChangeText={(t) => onChange(method.id, t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="0"
              placeholderTextColor={color.textFaint}
              accessibilityLabel={`${method.name} の金額`}
            />
          </View>
        </View>
      ))}
    </>
  );
}

/**
 * 入力中の文字列を送信用の内訳に畳む。
 *
 * ⚠️ **0 円と空欄は落とす。** 記録する意味が無いうえ、残すと集金履歴に
 *    「PayPay ¥0」が並ぶ（サーバ側も 0 を落とすが、往復させない）。
 * ⚠️ **`name` は送っても使われない**（サーバが methodId から引き直す）。
 *    下書きの復元と表示のためだけに持つ。
 */
export function toCashlessEntries(
  methods: PaymentMethod[],
  amounts: Record<string, string>
): { methodId: string; name: string; amount: number }[] {
  const entries: { methodId: string; name: string; amount: number }[] = [];
  for (const method of methods) {
    const amount = Number(amounts[method.id] ?? "");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    entries.push({ methodId: method.id, name: method.name, amount });
  }
  return entries;
}

/** 入力中の合計（円）。⚠️ 表示にもサーバへ送る値にも使うので 1 か所に置く */
export function cashlessTotal(amounts: Record<string, string>): number {
  return Object.values(amounts).reduce((sum, raw) => {
    const n = Number(raw);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, lineHeight: 20 },
  lead: { fontSize: 12, lineHeight: 18, marginBottom: spacing.md },
  spaced: { marginTop: spacing.lg },
  methodName: {
    fontFamily: font.uiBold,
    fontSize: 14,
    color: color.textMain,
    marginBottom: spacing.sm,
  },
  /* CollectAmountInputs と同じ見た目に揃える（あちらの styles は非公開） */
  inputGroup: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: radius.card - 6,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    backgroundColor: color.cardBg,
    overflow: "hidden",
  },
  addon: {
    minWidth: 48,
    paddingHorizontal: spacing.md,
    backgroundColor: color.cyan100,
    alignItems: "center",
    justifyContent: "center",
  },
  addonText: { fontFamily: font.uiBold, fontSize: 17, color: color.tealDeeper },
  input: {
    ...numeric,
    flex: 1,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: color.textMain,
  },
});
