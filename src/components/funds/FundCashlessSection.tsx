import { StyleSheet, Text, TextInput, View } from "react-native";
import { Muted } from "@/components/common/ui";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { CashlessEntry } from "@/offline/types";
import type { PaymentMethod } from "@/api/types";

/**
 * 集金詳細のキャッシュレスの内訳。表示と編集の両方をここで受け持つ。
 *
 * ⚠️ **単位は「円」。** 上の設備ごとの欄は硬貨の**枚数**なので混ぜないこと。
 *
 * ⚠️ **記録に残っている方法は、使用停止でも必ず並べる。** 並べないと
 *    **金額を 0 に戻すことすらできず、消せない内訳が残る。**
 */

export type MethodRow = { methodId: string; name: string };

/**
 * 編集欄に並べる支払方法を決める。
 *
 * 記録にあるもの（過去の名前つき）を先に置き、そのあとに店舗の有効な方法で
 * まだ出ていないものを足す。⚠️ **名前は記録側を優先する。**
 * 名前を変えても過去の表示が変わらない、という `cashless` の規約に合わせるため。
 */
export function buildMethodRows(
  recorded: CashlessEntry[] | null | undefined,
  storeMethods: PaymentMethod[]
): MethodRow[] {
  const rows: MethodRow[] = [];
  const seen = new Set<string>();

  for (const entry of recorded ?? []) {
    const methodId = String(entry?.methodId ?? "");
    if (!methodId || seen.has(methodId)) continue;
    seen.add(methodId);
    rows.push({ methodId, name: entry?.name ?? "支払方法" });
  }
  for (const method of storeMethods) {
    if (seen.has(method.id)) continue;
    seen.add(method.id);
    rows.push({ methodId: method.id, name: method.name });
  }
  return rows;
}

export function FundCashlessSection({
  methods,
  recorded,
  editing,
  draft,
  onChange,
}: {
  methods: MethodRow[];
  recorded: CashlessEntry[] | null | undefined;
  editing: boolean;
  /** methodId → 数字だけの文字列 */
  draft: Record<string, string>;
  onChange: (methodId: string, digitsOnly: string) => void;
}) {
  const saved = new Map((recorded ?? []).map((e) => [String(e.methodId), e.amount ?? 0]));

  if (!editing) {
    const rows = (recorded ?? []).filter((e) => (e.amount ?? 0) !== 0);
    if (rows.length === 0) return <Muted style={styles.empty}>現金以外の受け取りはありません</Muted>;
    return (
      <View style={styles.list}>
        {rows.map((entry) => (
          <View key={String(entry.methodId)} style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={styles.amount}>¥{(entry.amount ?? 0).toLocaleString()}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (methods.length === 0) {
    return <Muted style={styles.empty}>この店舗には現金以外の支払方法がありません</Muted>;
  }

  return (
    <View style={styles.list}>
      {methods.map((method) => (
        <View key={method.methodId} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {method.name}
            </Text>
            {/* 元の金額を添える。触ったあとでも戻す先が分かる */}
            <Text style={styles.before}>
              変更前 ¥{(saved.get(method.methodId) ?? 0).toLocaleString()}
            </Text>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.yen}>¥</Text>
            <TextInput
              style={styles.input}
              value={draft[method.methodId] ?? ""}
              onChangeText={(text) => onChange(method.methodId, text.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="0"
              placeholderTextColor={color.textFaint}
              accessibilityLabel={`${method.name}の金額`}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, paddingVertical: spacing.md },
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  name: { flex: 1, fontFamily: font.ui, fontSize: 14, color: color.textMain },
  before: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, marginTop: 2 },
  /* ⚠️ numeric を丸ごと展開する。fontFamily だけだと桁が揃わない */
  amount: { ...numeric, fontSize: 15, color: color.tealDeeper },
  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    width: 150,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card - 8,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    backgroundColor: color.cardBg,
  },
  yen: { fontFamily: font.uiBold, fontSize: 13, color: color.tealDeeper },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    textAlign: "right",
    fontFamily: font.ui,
    fontSize: 15,
    color: color.textMain,
  },
});
