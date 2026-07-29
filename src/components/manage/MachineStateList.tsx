import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Muted } from "@/components/common/ui";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { MachineState } from "@/api/types";

/**
 * 設備の状態。Web の MachinesState.jsx に当たる。
 *
 * ⚠️ 故障を解除したら故障内容も消すこと（Web の useMachinesState.js の changeMachineState と同じ）。
 *    残すと直ったはずの機械に古い故障内容がぶら下がる。切り替えは呼び出し側の toggleBreak が行う。
 */
export function MachineStateList({
  machines,
  canEdit,
  disabled,
  onToggleBreak,
  onChangeComment,
}: {
  machines: MachineState[];
  /** viewer は読み取り専用。入力欄ごと出さない */
  canEdit: boolean;
  /** オフライン中も含めた「今は変更できない」状態 */
  disabled: boolean;
  onToggleBreak: (machineId: string, next: boolean) => void;
  onChangeComment: (machineId: string, comment: string) => void;
}) {
  if (machines.length === 0) {
    return <Muted>設備が登録されていません。</Muted>;
  }

  return (
    <>
      {machines.map((machine) => (
        <View
          key={machine.id}
          style={[
            styles.machineBox,
            {
              backgroundColor: machine.break ? "#FFF7ED" : "#ECFEFF",
              borderColor: machine.break ? color.orange200 : color.cyan200,
            },
          ]}
        >
          <View style={styles.machineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.machineName}>{machine.name}</Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: machine.break ? color.orange300 : color.cyan200 },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: machine.break ? "#7C2D12" : color.tealDeeper },
                  ]}
                >
                  {machine.break ? "故障中" : "稼働中"}
                </Text>
              </View>
            </View>
            <Switch
              value={machine.break}
              disabled={disabled}
              onValueChange={(next) => onToggleBreak(machine.id, next)}
              trackColor={{ true: color.orange500, false: color.divider }}
            />
          </View>

          {/* 故障内容。Web の MachinesState.jsx も故障中のときだけ出す */}
          {machine.break && (
            <View style={styles.commentBox}>
              <Text style={styles.commentLabel}>故障内容</Text>
              {canEdit ? (
                <TextInput
                  value={machine.comment || ""}
                  onChangeText={(text) => onChangeComment(machine.id, text)}
                  editable={!disabled}
                  placeholder="故障の詳細を入力してください..."
                  placeholderTextColor={color.textFaint}
                  multiline
                  style={styles.commentInput}
                />
              ) : (
                <Muted>{machine.comment || "（詳細なし）"}</Muted>
              )}
            </View>
          )}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  machineBox: { borderWidth: 2, borderRadius: 14, padding: spacing.lg, marginBottom: spacing.md },
  machineRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  machineName: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  badgeText: { fontFamily: font.uiBold, fontSize: 11 },
  commentBox: {
    marginTop: spacing.md,
    backgroundColor: color.cardBg,
    borderWidth: 1,
    borderColor: color.orange200,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  commentLabel: {
    fontFamily: font.uiBold,
    fontSize: 13,
    color: color.textMain,
    marginBottom: spacing.sm,
  },
  commentInput: {
    fontFamily: font.ui,
    fontSize: 15,
    color: color.textMain,
    minHeight: 72,
    textAlignVertical: "top",
  },
});
