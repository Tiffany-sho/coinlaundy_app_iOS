import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";
import type { Draft } from "@/offline/types";

/** 集金入力の固定部分（ヘッダ・オフライン帯・下書きバナー・フッタ） */

/** Web と同じ：戻る + コインアイコン + 店名 + 「集金中」 */
export function CollectHeader({
  storeName,
  topInset,
  onBack,
}: {
  storeName: string;
  topInset: number;
  /** ⚠️ フッタのキャンセルと**同じ関数**を渡すこと。確認の有無が食い違うと入力が消える */
  onBack: () => void;
}) {
  return (
    <View style={[styles.header, { paddingTop: topInset + spacing.sm }]}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.headerBack}>
        <Ionicons name="chevron-back" size={22} color={color.textMuted} />
      </Pressable>
      <LinearGradient
        colors={["#0891B2", "#0E7490"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerIcon}
      >
        <Ionicons name="cash-outline" size={20} color="#FFFFFF" />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {storeName}店
        </Text>
        <Text style={styles.headerSub}>集金中</Text>
      </View>
    </View>
  );
}

export function CollectOfflineNote() {
  return (
    <View style={styles.offlineNote}>
      <Text style={styles.offlineNoteText}>
        オフライン — 登録すると送信待ちになり、電波が戻ると自動送信されます
      </Text>
    </View>
  );
}

/**
 * 一時保存データの案内。
 * ⚠️ 下書きは自動復元しない。勝手に埋まると今の入力なのか前回のものか分からなくなる
 *    （Web も同じくバナーで選ばせる）。
 */
export function DraftBanner({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: Draft;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <View style={styles.draftBanner}>
      <View style={{ flex: 1 }}>
        <Text style={styles.draftTitle}>一時保存データがあります</Text>
        <Text style={styles.draftTime}>
          保存日時:{" "}
          {new Date(draft.updatedAt).toLocaleString("ja-JP", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
      <Pressable onPress={onDiscard} style={styles.draftGhost}>
        <Text style={styles.draftGhostLabel}>破棄</Text>
      </Pressable>
      <Pressable onPress={onRestore} style={styles.draftPrimary}>
        <Text style={styles.draftPrimaryLabel}>復元</Text>
      </Pressable>
    </View>
  );
}

/**
 * 合計収益額と操作ボタン。Web のフッタと同じ。
 * ⚠️ 下端の余白はホームバー / ブラウザのツールバーに食われやすいので広めに取る。
 */
export function CollectFooter({
  total,
  bottomInset,
  keyboardVisible = false,
  submitting,
  onCancel,
  onSubmit,
}: {
  total: number;
  bottomInset: number;
  /** キーボードが出ているか。下の余白を詰めてキーボードに密着させる */
  keyboardVisible?: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <View
      style={[
        styles.footer,
        // ⚠️ キーボードが出ているときは safe area を足さない。ホームバーはキーボードに
        //    覆われているので不要で、足すとキーボードとの間に隙間が空く
        { paddingBottom: keyboardVisible ? spacing.lg : bottomInset + spacing.xxl },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.footerLabel}>合計収益額</Text>
        <Text style={styles.footerTotal}>¥{total.toLocaleString()}</Text>
      </View>
      <Pressable onPress={onCancel} style={styles.cancelButton}>
        <Text style={styles.cancelLabel}>キャンセル</Text>
      </Pressable>
      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        style={({ pressed }) => [
          styles.submitButton,
          pressed && { opacity: 0.85 },
          submitting && { opacity: 0.5 },
        ]}
      >
        <Text style={styles.submitLabel}>登録</Text>
      </Pressable>
    </View>
  );
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
  offlineNote: {
    backgroundColor: color.orange500,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  offlineNoteText: { fontFamily: font.ui, fontSize: 12, color: "#FFFFFF", textAlign: "center" },

  draftBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  draftTitle: { fontFamily: font.uiBold, fontSize: 13, color: "#92400E" },
  draftTime: { fontFamily: font.ui, fontSize: 11, color: "#B45309", marginTop: 2 },
  draftGhost: {
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.card - 8,
    borderWidth: 1,
    borderColor: "#FCD34D",
    alignItems: "center",
    justifyContent: "center",
  },
  draftGhostLabel: { fontFamily: font.uiBold, fontSize: 12, color: "#B45309" },
  draftPrimary: {
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.card - 8,
    backgroundColor: "#D97706",
    alignItems: "center",
    justifyContent: "center",
  },
  draftPrimaryLabel: { fontFamily: font.uiBold, fontSize: 12, color: "#FFFFFF" },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.cardBg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  footerLabel: { fontFamily: font.ui, fontSize: 11, color: color.textMuted },
  footerTotal: { fontFamily: font.uiBold, fontSize: 22, color: color.teal },
  cancelButton: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.card - 4,
    borderWidth: 2,
    borderColor: color.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMuted },
  submitButton: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.card - 4,
    backgroundColor: color.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  submitLabel: { fontFamily: font.uiBold, fontSize: 15, color: "#FFFFFF" },
});
