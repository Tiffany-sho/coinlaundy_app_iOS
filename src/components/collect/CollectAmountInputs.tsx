import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { SectionHead } from "@/components/common/section";
import { Muted } from "@/components/common/ui";
import { COIN_VALUE } from "@/shared/collectMoney";
import { color, font, radius, spacing } from "@/theme/tokens";

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

/** 機種ごとの入力。⚠️ 入れるのは硬貨の枚数（または質量）で、円ではない */
export function MachineAmountRows({
  rows,
  onChange,
  onToggle,
}: {
  rows: MachineRow[];
  onChange: (id: string, patch: Partial<MachineRow>) => void;
  onToggle: (row: MachineRow) => void;
}) {
  return (
    <>
      {rows.map((row, index) => (
        <View key={row.id}>
          {index > 0 && <View style={styles.rowDivider} />}

          <View style={styles.machineHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.machineName}>{row.name}</Text>
              <Text style={styles.machineHint}>
                {row.toggle ? "質量から計算" : "枚数を入力"}
              </Text>
            </View>
            <Pressable onPress={() => onToggle(row)} style={styles.swapButton} hitSlop={8}>
              <Ionicons name="refresh" size={16} color={color.teal} />
            </Pressable>
          </View>

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

          {row.funds != null && row.funds > 0 && (
            <View style={styles.resultBox}>
              <Text style={styles.resultText}>
                合計: ¥{(row.funds * COIN_VALUE).toLocaleString()}
              </Text>
            </View>
          )}
        </View>
      ))}
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
});
