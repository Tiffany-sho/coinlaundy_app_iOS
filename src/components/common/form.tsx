import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * 入力欄。Web の Chakra Input と同じ見え方にする。
 *   既定  : 1px solid var(--divider)
 *   focus : cyan.400 の枠 + rgba(6,182,212,0.15) のリング
 * リングは RN に box-shadow がないので枠線を 2px にして代用している。
 */
export function Input({ style, onFocus, onBlur, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      placeholderTextColor={color.textFaint}
      style={[styles.input, focused && styles.inputFocused, style]}
    />
  );
}

/** ラベル + 入力欄。Web の Field.Root / Field.Label に対応 */
export function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

export type RadioItem<T extends string> = {
  value: T;
  title: string;
  description: string;
};

/**
 * 2 択のカード型ラジオ。Web の RadioCard（初期設定の集金方法・権限選択）と同じ。
 * Web は md 以上で横並びにするが、iPhone 幅では常に縦積みになるので縦固定にしている。
 */
export function RadioCardGroup<T extends string>({
  label,
  hint,
  value,
  onChange,
  items,
}: {
  label: string;
  hint?: string;
  value: T;
  onChange: (value: T) => void;
  items: RadioItem<T>[];
}) {
  return (
    <View>
      <Text style={styles.radioLabel}>{label}</Text>
      {hint && <Text style={styles.radioHint}>{hint}</Text>}
      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <Pressable
              key={item.value}
              onPress={() => onChange(item.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.radioCard,
                selected && styles.radioCardSelected,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.radioTitle, selected && { color: color.cyan900 }]}>
                  {item.title}
                </Text>
                <Text style={[styles.radioDesc, selected && { color: color.cyan700 }]}>
                  {item.description}
                </Text>
              </View>
              <View style={[styles.radioMark, selected && styles.radioMarkSelected]}>
                {selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * チェックボックス。Web の新規登録にある「利用規約およびプライバシーポリシーに同意する」用。
 * RN に checkbox が無いので Pressable + アイコンで作る。
 */
export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.checkboxRow}
      hitSlop={6}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

/** 赤字のエラー行。Web は LuX アイコン + red.500 のテキスト */
export function FormError({ message }: { message: string }) {
  return (
    <View style={styles.errorRow}>
      <Ionicons name="close-circle" size={15} color={color.red500} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: HIT_SIZE,
    backgroundColor: color.cardBg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: font.ui,
    fontSize: 16,
    color: color.textMain,
    borderWidth: 1,
    borderColor: color.divider,
  },
  inputFocused: { borderWidth: 2, borderColor: color.cyan400, paddingHorizontal: spacing.lg - 1 },
  fieldLabel: {
    fontFamily: font.uiBold,
    fontSize: 13,
    color: color.textMain,
    marginBottom: spacing.sm,
  },
  fieldHint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, marginTop: spacing.xs },
  radioLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  radioHint: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 2 },
  radioCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: color.divider,
    backgroundColor: color.cardBg,
  },
  radioCardSelected: { borderColor: color.cyan400, backgroundColor: color.cyan50 },
  radioTitle: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain, marginBottom: 2 },
  radioDesc: { fontFamily: font.ui, fontSize: 13, color: color.textMuted, lineHeight: 19 },
  radioMark: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  radioMarkSelected: { borderColor: color.cyan400, backgroundColor: color.cyan400 },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: color.cyan300,
    backgroundColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: color.teal, borderColor: color.teal },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  errorText: { fontFamily: font.ui, fontSize: 13, color: color.red500, flex: 1 },
});
