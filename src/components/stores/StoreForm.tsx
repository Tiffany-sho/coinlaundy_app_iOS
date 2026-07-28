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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ApiError } from "@/api/client";
import { Button } from "@/components/common/ui";
import { Field, FormError, Input } from "@/components/common/form";
import { StoreImagePicker } from "@/components/stores/StoreImagePicker";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";
import type { Machine, StoreImage } from "@/api/types";

/**
 * 店舗の登録・編集フォーム。Web の CoinLaundryForm.jsx（+ MachineForm.jsx / PropoverForm.jsx）を移植。
 *
 * 章立ては Web と同じ順に並べる：店舗名 → 場所 → 概要 → 機械。
 *
 * ⚠️ images は onSubmit の値に**必ず含めて送ること**。省略すると空配列で上書きされ、
 *    Web で登録した写真まで消える（api/queries.ts の StoreInput 参照）。
 *    写真の実体は選んだ時点で Storage に上がるので、保存に失敗したときは
 *    onImageUploaded で受け取ったぶんを呼び出し側で消して巻き戻すこと。
 *
 * ⚠️ 価格・プラン・アップグレードに関する文言は一切置かないこと（App Store Guideline 3.1.3(a)）。
 *    店舗数の上限に達した場合はサーバが課金に触れない文言を返すので、それをそのまま出す。
 */

/** Web の CoinLaundryFormContext の initialState と同じ 5 種類。よく使う機種の呼び出し用 */
const PRESET_MACHINES = [
  "洗濯乾燥機",
  "乾燥機",
  "洗濯機",
  "スニーカー洗濯機",
  "ソフター自販機",
] as const;

/**
 * 編集中の機種 1 行。
 * laundry_store.machines の 1 要素は Web では { id, name, num, comment } を持ち、
 * 店舗詳細（HaveMachines.jsx）が「台数: {num}」「価格: {comment}」で表示している。
 * num / comment を落とすと Web 側の表示が壊れるので、必ず往復させること。
 */
export type MachineRow = Machine & { num: number; comment: string };

export type StoreFormValues = {
  store: string;
  location: string;
  description: string;
  machines: MachineRow[];
  /**
   * ⚠️ 保存時に**まるごと**送ること。省くと空配列で上書きされて既存の写真が消える。
   *    画像の実体は選んだ時点で Storage に上がっているので、ここには { url, path } が並ぶ。
   */
  images: StoreImage[];
};

/** 既存の machines を編集用に整える。未知のフィールドは温存する */
export function toMachineRows(machines: Machine[] | null | undefined): MachineRow[] {
  return (machines ?? []).map((machine) => {
    const num = typeof machine.num === "number" && Number.isFinite(machine.num) ? machine.num : 0;
    return {
      ...machine,
      id: typeof machine.id === "string" && machine.id ? machine.id : makeUuid(),
      name: typeof machine.name === "string" ? machine.name : "",
      // 0 台の機種は Web の登録フォームが保存前に落とすので本来存在しない。
      // 万一入っていても勝手に消さず 1 台として見せる
      num: num > 0 ? num : 1,
      comment: typeof machine.comment === "string" ? machine.comment : "",
    };
  });
}

/**
 * BFF が返した日本語のエラー文をそのまま出すためのヘルパー。
 * ⚠️ 言い換えないこと。特に店舗数の上限は課金に触れない文言がサーバ側で用意されている。
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function StoreForm({
  mode,
  initial,
  submitting,
  onSubmit,
  onCancel,
  onImageUploaded,
  children,
}: {
  mode: "create" | "edit";
  /**
   * 初期値。編集では useStore(id) の取得が終わってから描画すること
   * （useState の初期値でしか読まないので、後から差し替えても反映されない）。
   */
  initial?: {
    store?: string | null;
    location?: string | null;
    description?: string | null;
    machines?: Machine[] | null;
    images?: StoreImage[] | null;
  };
  submitting?: boolean;
  onSubmit: (values: StoreFormValues) => void;
  onCancel: () => void;
  /**
   * Storage に上げ終わった画像。保存に失敗したら呼び出し側でこれを消して巻き戻す
   * （本家 useStoreSubmit.js も失敗時に newImageObjects を消している）。
   */
  onImageUploaded?: (image: StoreImage) => void;
  /** フォームの下に足すもの。編集画面の削除ブロックなど */
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  const [store, setStore] = useState(initial?.store ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [machines, setMachines] = useState<MachineRow[]>(() => toMachineRows(initial?.machines));
  const [images, setImages] = useState<StoreImage[]>(() => initial?.images ?? []);
  const [newMachineName, setNewMachineName] = useState("");
  /** 機種の追加に失敗した理由。Web の reducer の msg と同じ役割 */
  const [machineError, setMachineError] = useState<string | null>(null);

  const canSubmit = store.trim().length > 0 && !submitting;

  function addMachine(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    // Web の ADD_MACHINES と同じ判定・同じ文言
    if (machines.some((m) => m.name === name)) {
      setMachineError("同じ機器名が含まれています");
      return;
    }
    setMachineError(null);
    setMachines((prev) => [...prev, { id: makeUuid(), name, num: 1, comment: "" }]);
    setNewMachineName("");
    Haptics.selectionAsync().catch(() => {});
  }

  function removeMachine(id: string) {
    setMachineError(null);
    setMachines((prev) => prev.filter((m) => m.id !== id));
    Haptics.selectionAsync().catch(() => {});
  }

  /** 台数の増減。Web は 0 で自動削除するが、アプリはゴミ箱で消す方が分かりやすいので 1 台を下限にする */
  function changeNum(id: string, delta: number) {
    setMachines((prev) =>
      prev.map((m) => (m.id === id ? { ...m, num: Math.max(1, m.num + delta) } : m))
    );
    Haptics.selectionAsync().catch(() => {});
  }

  function changeComment(id: string, comment: string) {
    setMachines((prev) => prev.map((m) => (m.id === id ? { ...m, comment } : m)));
  }

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      store: store.trim(),
      location: location.trim(),
      description: description.trim(),
      machines: machines.map((m) => ({ ...m, name: m.name.trim() })),
      images,
    });
  }

  const remainingPresets = PRESET_MACHINES.filter(
    (name) => !machines.some((m) => m.name === name)
  );

  return (
    <>
      {/* ヘッダ。Web はグラデーションの帯に「店舗登録 / 新しい店舗を追加」を出す */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={onCancel} hitSlop={12} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={22} color={color.textMuted} />
        </Pressable>
        <LinearGradient
          colors={["#0891B2", "#0E7490"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerIcon}
        >
          <Ionicons name="storefront-outline" size={20} color="#FFFFFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>{mode === "create" ? "店舗登録" : "店舗編集"}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {mode === "create" ? "新しい店舗を追加" : "店舗情報を更新"}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: spacing.xxl,
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Field label="店舗名" hint="一覧や詳細では「◯◯店」と表示されます">
              <Input
                value={store}
                onChangeText={setStore}
                placeholder="例) 四条河原町"
                autoFocus={mode === "create"}
              />
            </Field>

            <Field label="場所">
              <Input
                value={location}
                onChangeText={setLocation}
                placeholder="例) 京都府京都市下京区"
              />
            </Field>

            <Field label="概要">
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder="例) 駅前の商店街にある 24 時間営業の店舗です。"
                multiline
                style={styles.textarea}
              />
            </Field>
          </View>

          {/* ── 写真 ── */}
          <View style={styles.card}>
            <View style={styles.sectionHead}>
              <Ionicons name="images-outline" size={17} color={color.teal} />
              <Text style={styles.sectionLabel}>写真</Text>
            </View>
            <StoreImagePicker
              images={images}
              onChange={setImages}
              onUploaded={onImageUploaded}
              disabled={submitting}
            />
          </View>

          {/* ── 機械 ── */}
          <View style={styles.card}>
            <View style={styles.sectionHead}>
              <Ionicons name="construct-outline" size={17} color={color.teal} />
              <Text style={styles.sectionLabel}>機械</Text>
            </View>
            <Text style={styles.lead}>
              登録した機械は集金入力の項目になります。台数と価格帯は店舗詳細に表示されます。
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
                        onPress={() => removeMachine(machine.id)}
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
                          style={({ pressed }) => [
                            styles.stepperButton,
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <Ionicons name="add" size={18} color={color.textMuted} />
                        </Pressable>
                      </View>
                    </View>

                    <Text style={styles.machineFieldLabel}>価格帯・コメント</Text>
                    <Input
                      value={machine.comment}
                      onChangeText={(text) => changeComment(machine.id, text)}
                      placeholder="例) 20kg/1000円, 8分/100円"
                      style={styles.machineComment}
                    />
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
                    if (machineError) setMachineError(null);
                  }}
                  placeholder="機械名"
                  style={{ flex: 1 }}
                  returnKeyType="done"
                  onSubmitEditing={() => addMachine(newMachineName)}
                />
                <Button
                  label="追加"
                  variant="primary"
                  disabled={newMachineName.trim().length === 0}
                  onPress={() => addMachine(newMachineName)}
                />
              </View>

              {remainingPresets.length > 0 && (
                <View style={styles.presetRow}>
                  {remainingPresets.map((name) => (
                    <Pressable
                      key={name}
                      onPress={() => addMachine(name)}
                      style={({ pressed }) => [styles.preset, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                    >
                      <Ionicons name="add" size={13} color={color.tealDeeper} />
                      <Text style={styles.presetLabel}>{name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {machineError && <FormError message={machineError} />}
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Button
              label={mode === "create" ? "登録する" : "保存する"}
              variant="gradient"
              icon={mode === "create" ? "add-circle-outline" : "checkmark-circle-outline"}
              loading={submitting}
              disabled={!canSubmit}
              onPress={submit}
            />
            <Button label="キャンセル" variant="ghost" onPress={onCancel} disabled={submitting} />
          </View>

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

/** expo-crypto を足さずに済ませるための簡易 uuid v4（app/collect/[storeId].tsx と同じ） */
function makeUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: color.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
    ...shadow.sm,
  },
  headerBack: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: font.uiBold, fontSize: 18, color: color.tealDeeper },
  headerSub: { fontFamily: font.ui, fontSize: 11, color: color.textMuted },

  card: {
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.sm,
  },
  textarea: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: "top" },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
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
  machineComment: { minHeight: 44, paddingVertical: spacing.sm },

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
    fontFamily: font.mono,
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
