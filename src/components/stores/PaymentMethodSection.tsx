import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button } from "@/components/common/ui";
import { FormError, Input } from "@/components/common/form";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { PaymentMethod, PaymentMethodInput } from "@/api/types";

/**
 * 店舗フォームの「支払方法」の節。
 *
 * ⚠️ **現金は出さない。** 常に存在する暗黙の方法で、金額は
 *    「総額 − キャッシュレスの和」で出している。行として持たせると
 *    集金画面に現金が 2 つ並び、片方が総額に二重計上される。
 *
 * ⚠️ **「削除」は物理削除ではない。** 過去の集金（`collect_funds.cashless`）が
 *    参照しているので、一覧から外したものは `isActive: false` として
 *    **配列に残したまま**送る。サーバはそれを無効化として扱う。
 *    落として送ると「消えたもの」と「一度も無かったもの」の区別が付かなくなる。
 */

/** よく使うものを 1 タップで足せるように。⚠️ 「現金」は入れない */
const PRESET_METHODS = ["PayPay", "クレジットカード", "交通系IC", "楽天ペイ", "d払い"] as const;

/** ⚠️ サーバ（`reconcileStorePaymentMethods`）と同じ値にすること */
const MAX_NAME_LENGTH = 20;
const MAX_METHODS = 10;

export type PaymentMethodRow = PaymentMethodInput;

/** 既存の支払方法を編集用に整える。⚠️ 無効にしたものも落とさずに持つ */
export function toPaymentMethodRows(
  methods: PaymentMethod[] | null | undefined
): PaymentMethodRow[] {
  return (methods ?? [])
    .map((method) => ({ name: (method.name ?? "").trim(), isActive: method.isActive !== false }))
    .filter((row) => row.name.length > 0);
}

export function PaymentMethodSection({
  methods,
  onChange,
}: {
  methods: PaymentMethodRow[];
  onChange: (next: PaymentMethodRow[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const active = methods.filter((m) => m.isActive);
  const retired = methods.filter((m) => !m.isActive);
  const remainingPresets = PRESET_METHODS.filter(
    (name) => !methods.some((m) => m.name === name)
  );

  function add(rawName: string) {
    const name = rawName.trim();
    if (!name) return;

    if (name === "現金") {
      setError("「現金」は既定で記録されるため追加できません");
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      setError(`名前は ${MAX_NAME_LENGTH} 文字以内にしてください`);
      return;
    }
    /*
      ⚠️ 無効にしたものとも突き合わせる。同じ名前で作り直そうとしたときは
         新しく足さず**戻す**（サーバも名前で突き合わせるので、足しても
         UNIQUE(laundry_id, name) に当たって「すでにあります」になる）。
    */
    const existing = methods.find((m) => m.name === name);
    if (existing) {
      if (existing.isActive) {
        setError("同じ支払方法が含まれています");
        return;
      }
      restore(name);
      setNewName("");
      return;
    }
    if (active.length >= MAX_METHODS) {
      setError(`支払方法は ${MAX_METHODS} 件までです`);
      return;
    }

    setError(null);
    onChange([...methods, { name, isActive: true }]);
    setNewName("");
    Haptics.selectionAsync().catch(() => {});
  }

  /** 一覧から外す。⚠️ 配列からは落とさない（無効化として送るため） */
  function retire(name: string) {
    setError(null);
    onChange(methods.map((m) => (m.name === name ? { ...m, isActive: false } : m)));
    Haptics.selectionAsync().catch(() => {});
  }

  function restore(name: string) {
    if (active.length >= MAX_METHODS) {
      setError(`支払方法は ${MAX_METHODS} 件までです`);
      return;
    }
    setError(null);
    onChange(methods.map((m) => (m.name === name ? { ...m, isActive: true } : m)));
    Haptics.selectionAsync().catch(() => {});
  }

  return (
    <>
      <Text style={styles.lead}>
        現金以外の支払方法を登録すると、集金入力で方法ごとに金額を分けて記録できます。
        現金は登録しなくても常に記録されます。
      </Text>

      {active.length === 0 ? (
        <Text style={styles.empty}>現金のみ記録します</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {active.map((method) => (
            <View key={method.name} style={styles.card}>
              <Ionicons name="card-outline" size={17} color={color.teal} />
              <Text style={styles.name} numberOfLines={1}>
                {method.name}
              </Text>
              <Pressable
                onPress={() => retire(method.name)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`${method.name}を一覧から外す`}
                style={styles.trash}
              >
                <Ionicons name="trash-outline" size={17} color={color.red400} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.addBox}>
        <Text style={styles.fieldLabel}>支払方法を追加</Text>
        <View style={styles.addRow}>
          <Input
            value={newName}
            onChangeText={(text) => {
              setNewName(text);
              if (error) setError(null);
            }}
            placeholder="PayPay など"
            style={{ flex: 1 }}
            returnKeyType="done"
            onSubmitEditing={() => add(newName)}
          />
          <Button
            label="追加"
            variant="primary"
            disabled={newName.trim().length === 0}
            onPress={() => add(newName)}
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

      {/*
        ⚠️ **無効にしたものを見せる。** 過去の集金がその名前を参照しているので
           完全には消えない。「消したのに履歴に出る」を説明できるようにしておく。
      */}
      {retired.length > 0 && (
        <View style={styles.retiredBox}>
          <Text style={styles.fieldLabel}>使わなくなった支払方法</Text>
          <Text style={styles.retiredNote}>
            過去の集金記録には残ります。もう一度使うときは「戻す」を押してください。
          </Text>
          <View style={styles.presetRow}>
            {retired.map((method) => (
              <Pressable
                key={method.name}
                onPress={() => restore(method.name)}
                style={({ pressed }) => [styles.retiredChip, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`${method.name}を戻す`}
              >
                <Ionicons name="refresh" size={13} color={color.textMuted} />
                <Text style={styles.retiredChipLabel}>{method.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, lineHeight: 18 },
  empty: {
    fontFamily: font.ui,
    fontSize: 13,
    color: color.textFaint,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    backgroundColor: color.appBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
  },
  name: { flex: 1, fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  trash: { padding: 4 },
  fieldLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.textMuted },

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

  retiredBox: {
    borderTopWidth: 1,
    borderTopColor: color.divider,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  retiredNote: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, lineHeight: 16 },
  retiredChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: color.gray50,
    borderWidth: 1,
    borderColor: color.divider,
  },
  retiredChipLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.textMuted },
});
