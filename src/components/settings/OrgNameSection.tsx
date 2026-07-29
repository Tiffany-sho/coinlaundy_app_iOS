import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUpdateOrgName } from "@/api/queries";
import { Button } from "@/components/common/ui";
import { FormError, Input } from "@/components/common/form";
import { errorText, orgStyles } from "@/components/settings/orgShared";
import { color, font, radius, spacing } from "@/theme/tokens";

/** 組織名の表示と変更。Web の OrganizationSettings の組織情報ブロック */
export function OrgNameSection({ name, canEdit }: { name: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const update = useUpdateOrgName();

  // 別画面で名前が変わったときに編集中でない入力欄を追従させる
  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  return (
    <View>
      <Text style={orgStyles.sectionTitle}>組織情報</Text>
      <View style={styles.orgBox}>
        {editing ? (
          <View style={{ gap: spacing.md }}>
            <Input value={value} onChangeText={setValue} autoFocus placeholder="組織名" />
            {update.error && (
              <FormError message={errorText(update.error, "組織名を更新できませんでした")} />
            )}
            <View style={orgStyles.formActions}>
              <Button
                label="キャンセル"
                variant="ghost"
                onPress={() => {
                  setValue(name);
                  update.reset();
                  setEditing(false);
                }}
              />
              <Button
                label="保存"
                variant="gradient"
                loading={update.isPending}
                disabled={value.trim().length === 0}
                onPress={() => update.mutate(value.trim(), { onSuccess: () => setEditing(false) })}
              />
            </View>
          </View>
        ) : (
          <View style={styles.orgRow}>
            <Text style={styles.orgName}>{name || "未設定"}</Text>
            {canEdit && (
              <Pressable onPress={() => setEditing(true)} hitSlop={10} style={orgStyles.editLink}>
                <Ionicons name="pencil" size={13} color={color.teal} />
                <Text style={orgStyles.editLabel}>編集</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  orgBox: {
    backgroundColor: color.tealPale,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.lg,
  },
  orgRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orgName: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper, flex: 1 },
});
