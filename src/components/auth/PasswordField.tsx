import { Pressable, StyleSheet, Text, View, type TextInputProps } from "react-native";
import { Field, Input } from "@/components/common/form";
import { color, font, HIT_SIZE } from "@/theme/tokens";

/**
 * パスワードの入力欄。Web の PasswordInput（表示切り替え付き）に対応する。
 *
 * ⚠️ **表示切り替えは 1 画面に 1 つ。** 新規登録の「パスワード」と「パスワード（確認）」は
 *    同じ `visible` を共有し、ボタンは上の欄にだけ置く（`onToggleVisible` を渡さない側は
 *    ボタンが出ない）。両方に置くと片方だけ表示されている状態が作れて混乱する。
 */
export function PasswordField({
  label,
  hint,
  visible,
  onToggleVisible,
  ...props
}: Omit<TextInputProps, "style"> & {
  label: string;
  hint?: string;
  visible: boolean;
  onToggleVisible?: () => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <View>
        <Input
          {...props}
          tone="plain"
          secureTextEntry={!visible}
          autoCapitalize="none"
          /* ⚠️ 切り替えボタンの下に文字が潜り込まないよう右を空ける */
          style={onToggleVisible ? { paddingRight: HIT_SIZE } : undefined}
        />
        {onToggleVisible && (
          <Pressable
            onPress={onToggleVisible}
            style={styles.eye}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? "パスワードを隠す" : "パスワードを表示"}
          >
            <Text style={styles.eyeLabel}>{visible ? "隠す" : "表示"}</Text>
          </Pressable>
        )}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  eye: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: HIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.textMuted },
});
