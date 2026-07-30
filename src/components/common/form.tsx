import { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, font, radius, shadow, spacing, HIT_SIZE } from "@/theme/tokens";

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

export type SelectOption<T> = { value: T; label: string };

/** 一覧の 1 行の高さ。⚠️ 選択中の行まで寄せる計算に使うので固定にしてある */
const SELECT_ROW_HEIGHT = 48;

/**
 * セレクト。Web の `<select>` に相当する。
 *
 * ⚠️ **`dialog.choose` で代用しない。** あちらは選択肢を実行ボタンとして縦に
 *    全部並べる作りで、高さの制限もスクロールも無い。10 個を超えると
 *    画面外へはみ出して選べなくなる（時刻は 24 個ある）。
 *
 * ⚠️ **`fullScreenModal` の画面では使えない。** iOS はモーダルの上にモーダルを
 *    重ねられないため（docs/traps.md）。今の利用箇所は通常の Stack 画面のみ。
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  title,
  disabled,
  placeholder = "選択してください",
}: {
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** モーダルの見出し */
  title: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  /**
   * 開いた直後に選択中の行を見える位置へ寄せる。
   * ⚠️ `contentOffset` ではなく onLayout + scrollTo にしてある。前者は web で効かない。
   */
  function onListLayout() {
    if (selectedIndex > 2) {
      scrollRef.current?.scrollTo({
        y: (selectedIndex - 2) * SELECT_ROW_HEIGHT,
        animated: false,
      });
    }
  }

  return (
    <>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        style={({ pressed }) => [
          styles.selectField,
          disabled && { opacity: 0.5 },
          pressed && !disabled && { opacity: 0.85 },
        ]}
      >
        <Text style={[styles.selectValue, !selected && { color: color.textFaint }]}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={color.cyan400} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.selectBackdrop} onPress={() => setOpen(false)}>
          {/* 中身のタップが背景に抜けないように空の onPress で止める */}
          <Pressable style={styles.selectSheet} onPress={() => {}}>
            <Text style={styles.selectTitle}>{title}</Text>

            <ScrollView
              ref={scrollRef}
              onLayout={onListLayout}
              style={styles.selectList}
              contentContainerStyle={{ paddingVertical: spacing.xs }}
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    key={String(option.value)}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={({ pressed }) => [
                      styles.selectRow,
                      isSelected && styles.selectRowSelected,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      style={[styles.selectRowLabel, isSelected && styles.selectRowLabelSelected]}
                    >
                      {option.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={color.teal} />}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => setOpen(false)}
              style={({ pressed }) => [styles.selectCancel, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.selectCancelLabel}>キャンセル</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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

  /* セレクト。閉じているときは Input と同じ見え方に揃える */
  selectField: {
    minHeight: HIT_SIZE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: color.cardBg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: color.divider,
  },
  selectValue: { fontFamily: font.ui, fontSize: 16, color: color.textMain, flexShrink: 1 },
  selectBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  selectSheet: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadow.hero,
  },
  selectTitle: {
    fontFamily: font.uiBold,
    fontSize: 16,
    color: color.textMain,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  /* ⚠️ 高さを縛らないと選択肢の数だけ伸びて画面外へはみ出す */
  selectList: { maxHeight: SELECT_ROW_HEIGHT * 6 },
  selectRow: {
    height: SELECT_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  selectRowSelected: { backgroundColor: color.tealPale },
  selectRowLabel: { fontFamily: font.ui, fontSize: 16, color: color.textMain },
  selectRowLabelSelected: { fontFamily: font.uiBold, color: color.tealDeeper },
  selectCancel: {
    minHeight: HIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.divider,
  },
  selectCancelLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.textMuted },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  errorText: { fontFamily: font.ui, fontSize: 13, color: color.red500, flex: 1 },
});
