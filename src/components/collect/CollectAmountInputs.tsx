import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { SectionHead } from "@/components/common/section";
import { Muted } from "@/components/common/ui";
import { cashlessTotal } from "@/components/collect/CashlessInputs";
import { COIN_VALUE } from "@/shared/collectMoney";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { PaymentMethod } from "@/api/types";

/**
 * 集金方式と金額入力。
 *
 * 機種ごとに「枚数」と「質量」を別々に保持し、⟳ ボタンで表示を切り替える。
 * ⚠️ 質量 → 枚数の換算は**切り替えた瞬間**に行う（Web と同じ）。両方を同時に真とすると
 *    どちらが最新か決められなくなる。
 */

export type MachineRow = {
  id: string;
  name: string;
  /** 硬貨の枚数 */
  funds: number | null;
  /** 100 円玉の質量（g） */
  weight: number | null;
  /** true なら質量入力モード */
  toggle: boolean;
  /**
   * この機器で受け取ったキャッシュレス。methodId → 数字だけの文字列。
   *
   * ⚠️ **単位は「円」。** 同じ行の `funds` は硬貨の**枚数**なので混ぜないこと。
   * ⚠️ **前バージョンの下書きには無い**（MMKV から復元されると `undefined`）。
   *    読むときは `?? {}` を通すこと。
   */
  cashless?: Record<string, string>;
};

/** 機種別 / 合計 の切り替えと「次回もこの集金方式を使う」 */
export function CollectMethodSection({
  byMachine,
  fixedMethod,
  onChangeMethod,
  onChangeFixed,
}: {
  byMachine: boolean;
  fixedMethod: boolean;
  onChangeMethod: (next: boolean) => void;
  onChangeFixed: (next: boolean) => void;
}) {
  return (
    <>
      <View style={styles.methodRow}>
        <View style={{ flex: 1 }}>
          <SectionHead icon="cash-outline" label="集金方式" noMargin />
          <Muted style={{ marginTop: 4 }}>
            {byMachine ? "各機種ごとに金額を入力します" : "合計金額のみを入力します"}
          </Muted>
        </View>
        <Switch
          value={byMachine}
          onValueChange={(v) => {
            Haptics.selectionAsync().catch(() => {});
            onChangeMethod(v);
          }}
          trackColor={{ true: color.teal, false: "#CBD5E1" }}
        />
      </View>

      {/* Web の FixSwitch（「この状態に固定」）に当たるもの */}
      <Pressable
        style={styles.fixRow}
        onPress={() => onChangeFixed(!fixedMethod)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: fixedMethod }}
        hitSlop={6}
      >
        <Ionicons
          name={fixedMethod ? "checkbox" : "square-outline"}
          size={20}
          color={fixedMethod ? color.teal : color.textFaint}
        />
        <Text style={styles.fixLabel}>次回もこの集金方式を使う</Text>
      </Pressable>
    </>
  );
}

/**
 * 機種ごとの入力。⚠️ 現金の欄に入れるのは硬貨の**枚数**（または質量）で、円ではない。
 *
 * ⚠️ **支払方法の欄だけ単位が「円」。** 同じカードに単位の違う欄が並ぶので、
 *    アドオンの「枚」「¥」を消さないこと。
 *
 * ⚠️ **キャッシュレスの欄は既定でたたんでおく。** 5 機種 × 3 方法で 15 欄になり、
 *    出しっぱなしだと現金だけ入れたい人が延々スクロールすることになる。
 *    ただし**すでに入力がある機器は開いた状態で出す**（下書きから戻したときに
 *    入力済みの金額が隠れていると、入れ忘れと区別が付かない）。
 */
export function MachineAmountRows({
  rows,
  methods,
  showCash = true,
  onChange,
  onToggle,
}: {
  rows: MachineRow[];
  /** ⚠️ 使用中のものだけ。現金は含まない（現金は上の枚数欄そのもの） */
  methods: PaymentMethod[];
  /**
   * 硬貨の枚数の欄を出すか。「現金以外のみ」の集金では false。
   * ⚠️ **false のときは ⟳（質量入力）も出さない。** 現金を入れない集金で
   *    質量から枚数を計算しても行き場が無い。
   */
  showCash?: boolean;
  onChange: (id: string, patch: Partial<MachineRow>) => void;
  onToggle: (row: MachineRow) => void;
}) {
  /** 手で開いた／閉じた機器。⚠️ 未指定のものは「入力があれば開く」に従う */
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  return (
    <>
      {rows.map((row, index) => {
        const amounts = row.cashless ?? {};
        const rowCashless = cashlessTotal(amounts);
        // ⚠️ 現金の欄を出していないときは常に開く（たたむと入力欄が 1 つも無くなる）
        const open = showCash ? (opened[row.id] ?? rowCashless > 0) : true;
        const cash = showCash ? (row.funds ?? 0) * COIN_VALUE : 0;

        return (
          <View key={row.id}>
            {index > 0 && <View style={styles.rowDivider} />}

            <View style={styles.machineHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.machineName}>{row.name}</Text>
                <Text style={styles.machineHint}>
                  {showCash ? (row.toggle ? "質量から計算" : "枚数を入力") : "現金以外を入力"}
                </Text>
              </View>
              {showCash && (
                <Pressable onPress={() => onToggle(row)} style={styles.swapButton} hitSlop={8}>
                  <Ionicons name="refresh" size={16} color={color.teal} />
                </Pressable>
              )}
            </View>

            {showCash && (
              <View style={styles.inputGroup}>
                <View style={styles.addon}>
                  <Text style={styles.addonText}>{row.toggle ? "g" : "枚"}</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={displayValue(row)}
                  onChangeText={(text) => {
                    const n = parseInt(text.replace(/[^0-9]/g, ""), 10);
                    const value = Number.isFinite(n) ? n : null;
                    onChange(row.id, row.toggle ? { weight: value } : { funds: value });
                  }}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  placeholder={row.toggle ? "100円玉の質量を入力" : "100円玉の枚数を入力"}
                  placeholderTextColor={color.textFaint}
                />
              </View>
            )}

            {/* ⚠️ 支払方法が 1 件も無い店舗ではこのブロックごと出さない */}
            {methods.length > 0 && (
              <>
                {/* ⚠️ 現金の欄が無いときは開閉ボタンを出さない（常に開いている） */}
                {showCash && (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setOpened((prev) => ({ ...prev, [row.id]: !open }));
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  hitSlop={6}
                  style={({ pressed }) => [styles.cashlessToggle, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="card-outline" size={14} color={color.teal} />
                  <Text style={styles.cashlessToggleLabel}>現金以外</Text>
                  {/* たたんでいても入力済みの金額が分かるようにする */}
                  {rowCashless > 0 && (
                    <Text style={styles.cashlessBadge}>¥{rowCashless.toLocaleString()}</Text>
                  )}
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={color.teal}
                  />
                </Pressable>
                )}

                {open && (
                  <View style={[styles.cashlessBox, !showCash && styles.cashlessBoxBare]}>
                    {methods.map((method) => (
                      <View key={method.id} style={styles.cashlessRow}>
                        <Text style={styles.cashlessName} numberOfLines={1}>
                          {method.name}
                        </Text>
                        <View style={styles.cashlessInputGroup}>
                          <Text style={styles.cashlessYen}>¥</Text>
                          <TextInput
                            style={styles.cashlessInput}
                            value={amounts[method.id] ?? ""}
                            onChangeText={(text) =>
                              onChange(row.id, {
                                cashless: {
                                  ...amounts,
                                  [method.id]: text.replace(/[^0-9]/g, ""),
                                },
                              })
                            }
                            keyboardType="number-pad"
                            inputMode="numeric"
                            placeholder="0"
                            placeholderTextColor={color.textFaint}
                            accessibilityLabel={`${row.name}の${method.name}の金額`}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {(cash > 0 || rowCashless > 0) && (
              <View style={styles.resultBox}>
                <Text style={styles.resultText}>
                  合計: ¥{(cash + rowCashless).toLocaleString()}
                </Text>
                {/* ⚠️ 内訳を出す。合計だけだと現金の枚数を間違えても気づけない */}
                {showCash && rowCashless > 0 && (
                  <Text style={styles.resultBreakdown}>
                    現金 ¥{cash.toLocaleString()} ／ 現金以外 ¥{rowCashless.toLocaleString()}
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

/** 合計だけを入れるほうの欄。⚠️ こちらの単位は枚数ではなく円 */
export function TotalAmountInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (digitsOnly: string) => void;
}) {
  return (
    <View style={styles.inputGroup}>
      <View style={styles.addon}>
        <Text style={[styles.addonText, { fontSize: 17 }]}>¥</Text>
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder="合計金額を入力してください"
        placeholderTextColor={color.textFaint}
      />
    </View>
  );
}

function displayValue(row: MachineRow): string {
  const value = row.toggle ? row.weight : row.funds;
  return value != null ? String(value) : "";
}

const styles = StyleSheet.create({
  methodRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  fixRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    minHeight: 40,
  },
  fixLabel: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },

  rowDivider: { height: 1, backgroundColor: color.divider, marginVertical: spacing.lg },
  machineHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  machineName: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  machineHint: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 2 },
  swapButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    backgroundColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },

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
  addonText: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    fontFamily: font.ui,
    fontSize: 16,
    color: color.textMain,
  },
  resultBox: {
    marginTop: spacing.sm,
    backgroundColor: color.tealPale,
    borderRadius: radius.card - 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resultText: { fontFamily: font.uiBold, fontSize: 13, color: color.tealDeeper },
  resultBreakdown: {
    fontFamily: font.ui,
    fontSize: 11,
    color: color.tealDeeper,
    marginTop: 2,
  },

  cashlessToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
    marginTop: spacing.sm,
  },
  cashlessToggleLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.teal },
  /* たたんでいるときの入力済み金額。⚠️ flex:1 で右端の chevron を端に寄せる */
  cashlessBadge: {
    flex: 1,
    fontFamily: font.uiBold,
    fontSize: 12,
    color: color.tealDeeper,
    textAlign: "right",
  },
  cashlessBox: {
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: color.cyan100,
  },
  /* 現金の欄が無いときは入れ子に見せる必要がないので線を外す */
  cashlessBoxBare: { paddingLeft: 0, borderLeftWidth: 0, marginTop: spacing.sm },
  cashlessRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cashlessName: { flex: 1, fontFamily: font.ui, fontSize: 13, color: color.textMuted },
  cashlessInputGroup: {
    flexDirection: "row",
    alignItems: "center",
    width: 140,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card - 8,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    backgroundColor: color.cardBg,
  },
  cashlessYen: { fontFamily: font.uiBold, fontSize: 13, color: color.tealDeeper },
  cashlessInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    textAlign: "right",
    fontFamily: font.ui,
    fontSize: 15,
    color: color.textMain,
  },
});
