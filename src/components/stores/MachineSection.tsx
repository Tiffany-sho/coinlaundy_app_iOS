import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button } from "@/components/common/ui";
import { FormError, Input } from "@/components/common/form";
import { makeUuid } from "@/shared/uuid";
import { color, font, radius, spacing, numeric } from "@/theme/tokens";
import type { MachineRow } from "@/components/stores/StoreForm";

/**
 * 店舗フォームの「機械」の節。Web の MachineForm.jsx / PropoverForm.jsx に当たる。
 *
 * ⚠️ 価格帯（comment）の入力欄はアプリには置かない。ただし machines は保存のたびに
 *    配列ごと置き換わるので、値そのものは往復させること（StoreForm の MachineRow 参照）。
 */

/** Web の CoinLaundryFormContext の initialState と同じ 5 種類。よく使う機種の呼び出し用 */
const PRESET_MACHINES = [
  "洗濯乾燥機",
  "乾燥機",
  "洗濯機",
  "スニーカー洗濯機",
  "ソフター自販機",
] as const;

export function MachineSection({
  machines,
  onChange,
}: {
  machines: MachineRow[];
  onChange: (next: MachineRow[]) => void;
}) {
  const [newMachineName, setNewMachineName] = useState("");
  /** 機種の追加に失敗した理由。Web の reducer の msg と同じ役割 */
  const [error, setError] = useState<string | null>(null);

  const remainingPresets = PRESET_MACHINES.filter(
    (name) => !machines.some((m) => m.name === name)
  );

  function add(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    // Web の ADD_MACHINES と同じ判定・同じ文言
    if (machines.some((m) => m.name === name)) {
      setError("同じ機器名が含まれています");
      return;
    }
    setError(null);
    onChange([...machines, { id: makeUuid(), name, num: 1, comment: "" }]);
    setNewMachineName("");
    Haptics.selectionAsync().catch(() => {});
  }

  function remove(id: string) {
    setError(null);
    onChange(machines.filter((m) => m.id !== id));
    Haptics.selectionAsync().catch(() => {});
  }

  /** 台数の増減。Web は 0 で自動削除するが、アプリはゴミ箱で消す方が分かりやすいので 1 台を下限にする */
  function changeNum(id: string, delta: number) {
    onChange(machines.map((m) => (m.id === id ? { ...m, num: Math.max(1, m.num + delta) } : m)));
    Haptics.selectionAsync().catch(() => {});
  }

  return (
    <>
      <Text style={styles.lead}>
        登録した機械は集金入力の項目になります。台数は店舗詳細に表示されます。
      </Text>

      {machines.length === 0 ? (
        <Text style={styles.emptyMachines}>まだ機械が登録されていません</Text>
      ) : (
        <View style={{ gap: spacing.md }}>
          {machines.map((machine) => (
            <View key={machine.id} style={styles.machineCard}>
              <View style={styles.machineHead}>
                <Text style={styles.machineName} numberOfLines={1}>
                  {machine.name}
                </Text>
                <Pressable
                  onPress={() => remove(machine.id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`${machine.name}を削除`}
                  style={styles.machineTrash}
                >
                  <Ionicons name="trash-outline" size={17} color={color.red400} />
                </Pressable>
              </View>

              <View style={styles.stepperRow}>
                <Text style={styles.machineFieldLabel}>台数</Text>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => changeNum(machine.id, -1)}
                    disabled={machine.num <= 1}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="台数を減らす"
                    style={({ pressed }) => [
                      styles.stepperButton,
                      machine.num <= 1 && styles.stepperButtonDisabled,
                      pressed && machine.num > 1 && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons
                      name="remove"
                      size={18}
                      color={machine.num <= 1 ? color.textFaint : color.textMuted}
                    />
                  </Pressable>
                  <Text style={styles.stepperValue}>{machine.num}</Text>
                  <Pressable
                    onPress={() => changeNum(machine.id, 1)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="台数を増やす"
                    style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="add" size={18} color={color.textMuted} />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 追加。Web は PropoverForm の「機械名 + 台数」ダイアログ */}
      <View style={styles.addBox}>
        <Text style={styles.machineFieldLabel}>機械を追加</Text>
        <View style={styles.addRow}>
          <Input
            value={newMachineName}
            onChangeText={(text) => {
              setNewMachineName(text);
              if (error) setError(null);
            }}
            placeholder="機械名"
            style={{ flex: 1 }}
            returnKeyType="done"
            onSubmitEditing={() => add(newMachineName)}
          />
          <Button
            label="追加"
            variant="primary"
            disabled={newMachineName.trim().length === 0}
            onPress={() => add(newMachineName)}
          />
        </View>

        {remainingPresets.length > 0 && (
          <View style={styles.presetRow}>
            {remainingPresets.map((name) => (
              <Pressable
                key={name}
                onPress={() => add(name)}
                style={({ pressed }) => [styles.preset, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={13} color={color.tealDeeper} />
                <Text style={styles.presetLabel}>{name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {error && <FormError message={error} />}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, lineHeight: 18 },
  emptyMachines: {
    fontFamily: font.ui,
    fontSize: 13,
    color: color.textFaint,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  machineCard: {
    backgroundColor: color.appBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.md,
    gap: spacing.sm,
  },
  machineHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  machineName: { flex: 1, fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  machineTrash: { padding: 4 },
  machineFieldLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.textMuted },

  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.divider,
    backgroundColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonDisabled: { opacity: 0.5 },
  stepperValue: {
    ...numeric,
    fontSize: 18,
    color: color.tealDeeper,
    minWidth: 48,
    textAlign: "center",
    paddingVertical: spacing.sm,
    backgroundColor: color.tealPale,
    borderRadius: radius.md,
    overflow: "hidden",
  },

  addBox: {
    borderTopWidth: 1,
    borderTopColor: color.divider,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  preset: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: color.tealPale,
    borderWidth: 1,
    borderColor: color.cyan200,
  },
  presetLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.tealDeeper },
});
