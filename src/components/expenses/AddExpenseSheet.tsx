import { useRef } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Muted } from "@/components/common/ui";
import { color, font, radius, spacing } from "@/theme/tokens";

/** 何を足すか。⚠️ 単発と固定費で行き先が違う（片方は画面、片方はシート） */
export type AddChoice = "once" | "recurring";

/**
 * 「経費を追加」を押したときの 2 択。
 *
 * ⚠️ **単発と固定費を 1 つのボタンにまとめない。** 入力する項目が違ううえ、
 *    固定費は「毎月ずっと計上される」という別の意味を持つ。まとめると
 *    どちらを作ったのか分からないまま登録されることになる。
 *
 * ⚠️ **選んだあとの処理はシートが閉じ切ってから行う。** 単発は
 *    `router.push` で画面へ行くので、開いたまま push すると
 *    **以降タブを切り替えても何も表示されなくなる**（docs/traps.md の iOS）。
 *    固定費も Modal を重ねることになるので同じく待つ。
 */
export function AddExpenseSheet({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (choice: AddChoice) => void;
}) {
  const insets = useSafeAreaInsets();
  /** 閉じ切ってから実行したい選択。⚠️ onDismiss は iOS 専用 */
  const pending = useRef<AddChoice | null>(null);

  function choose(choice: AddChoice) {
    Haptics.selectionAsync().catch(() => {});
    if (Platform.OS === "ios") {
      pending.current = choice;
      onClose();
      return;
    }
    /* ⚠️ web / Android は onDismiss が来ないので待たずに進める
          （入れないとブラウザ確認で何も起きない） */
    onClose();
    onChoose(choice);
  }

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onDismiss={() => {
        const choice = pending.current;
        pending.current = null;
        if (choice) onChoose(choice);
      }}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>何を追加しますか？</Text>

          <Option
            icon="receipt-outline"
            title="経費"
            note="仕入れ・修繕など、その日にかかった支出"
            onPress={() => choose("once")}
          />
          <Option
            icon="repeat"
            title="毎月の固定費"
            note="家賃・水道光熱費など、毎月かかるもの"
            onPress={() => choose("recurring")}
          />

          <Muted style={styles.hint}>
            固定費は登録した月から毎月自動で計上されます。
          </Muted>
        </View>
      </View>
    </Modal>
  );
}

function Option({
  icon,
  title,
  note,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  note: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.option, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.optionIcon}>
        <Ionicons name={icon} size={20} color={color.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Muted style={styles.optionNote}>{note}</Muted>
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.cyan300} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: color.cardBg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.divider,
    marginBottom: spacing.sm,
  },
  title: { fontFamily: font.uiBold, fontSize: 17, color: color.textMain, marginBottom: spacing.xs },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.appBg,
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: color.cyan50,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  optionNote: { fontSize: 11, marginTop: 1 },
  hint: { fontSize: 11, textAlign: "center", marginTop: spacing.xs },
});
