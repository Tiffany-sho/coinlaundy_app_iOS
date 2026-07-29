import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useJoinPassword, useSetJoinPassword } from "@/api/queries";
import { Button } from "@/components/common/ui";
import { FormError, Input } from "@/components/common/form";
import { errorText, orgStyles } from "@/components/settings/orgShared";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 組織参加パスワード。Web の OrgJoinPasswordCard を移植。
 * ⚠️ 現在値は伏せ字でしか出さない。空欄で保存すると削除になる（＝参加を受け付けなくなる）。
 */
export function JoinPasswordCard() {
  const { data, isLoading } = useJoinPassword();
  const save = useSetJoinPassword();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  const hasPassword = Boolean(data);

  return (
    <View style={orgStyles.card}>
      <View style={orgStyles.headRow}>
        <View style={orgStyles.cardHead}>
          <Ionicons name="key-outline" size={16} color={color.teal} />
          <Text style={orgStyles.sectionTitle}>組織参加パスワード</Text>
        </View>
        {!editing && (
          <Pressable
            onPress={() => {
              setValue(data ?? "");
              setSaved(false);
              setEditing(true);
            }}
            hitSlop={10}
            style={orgStyles.editLink}
          >
            <Ionicons name="pencil" size={13} color={color.teal} />
            <Text style={orgStyles.editLabel}>{hasPassword ? "変更" : "設定"}</Text>
          </Pressable>
        )}
      </View>

      <Text style={orgStyles.lead}>
        このパスワードを共有したユーザーが組織に参加できます。未設定の場合は参加リクエストを受け付けません。
      </Text>

      {!editing ? (
        <View style={styles.passwordBox}>
          <Ionicons name="eye-off-outline" size={14} color={color.textFaint} />
          <Text style={[styles.passwordText, !hasPassword && { color: color.textFaint }]}>
            {isLoading ? "…" : hasPassword ? "••••••••" : "未設定"}
          </Text>
          {saved && (
            <View style={styles.savedRow}>
              <Ionicons name="checkmark" size={13} color={color.teal} />
              <Text style={styles.savedText}>保存済み</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <Input
            value={value}
            onChangeText={setValue}
            placeholder="例: laundry2024"
            autoFocus
            autoCapitalize="none"
          />
          <Text style={orgStyles.hint}>空欄で保存すると参加パスワードを削除します。</Text>
          {save.error && <FormError message={errorText(save.error, "保存に失敗しました")} />}
          <View style={orgStyles.formActions}>
            <Button
              label="キャンセル"
              variant="ghost"
              onPress={() => {
                save.reset();
                setEditing(false);
              }}
            />
            <Button
              label="保存"
              variant="gradient"
              loading={save.isPending}
              onPress={() =>
                save.mutate(value.trim(), {
                  onSuccess: () => {
                    setEditing(false);
                    setSaved(true);
                  },
                })
              }
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  passwordBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.appBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  passwordText: { fontFamily: font.ui, fontSize: 14, color: color.textMain },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto" },
  savedText: { fontFamily: font.uiBold, fontSize: 11, color: color.teal },
});
