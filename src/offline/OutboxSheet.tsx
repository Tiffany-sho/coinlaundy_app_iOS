import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { formatJstDate } from "@/shared/date";
import { color, font, numeric, radius, spacing, HIT_SIZE } from "@/theme/tokens";
import type { OutboxItem } from "./types";

/**
 * 送信待ち・送信できなかった集金の一覧。ホームのバッジから開く。
 *
 * ⚠️ **これが無いと「送信失敗」から抜け出せない。** `flushOutbox` は
 *    `status === "failed"` を**読み飛ばす**ので、バッジを何度押しても
 *    再送されない（2026-08-05 まで「タップで再送」と書いてありながら
 *    **失敗した分には一切効いていなかった**）。しかも 4xx で失敗したものは
 *    再送しても通らないので、**破棄する手段のほうが本命。**
 *
 * ⚠️ **確認ダイアログ（`useDialog()`）をここから呼ばない。** iOS は
 *    Modal の上に Modal を重ねられず、**何も表示されないまま押しても
 *    無反応になる**（`docs/traps.md` の iOS）。破棄の確認は
 *    **同じシートの中で 2 段**にしてある。
 */
export function OutboxSheet({
  open,
  items,
  onClose,
  onRetry,
  onDiscard,
}: {
  open: boolean;
  items: OutboxItem[];
  onClose: () => void;
  /** 失敗した分を pending へ戻してから再送する */
  onRetry: () => void;
  onDiscard: (id: string) => void;
}) {
  /** 破棄の確認中の 1 件。⚠️ ダイアログを重ねられないので行の中で聞く */
  const [confirming, setConfirming] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const failed = items.filter((i) => i.status === "failed");

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={() => setConfirming(null)}
    >
      {/* ⚠️ 背景と本体は兄弟にする（入れ子だと最初のタップを外側が取る） */}
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="閉じる" />
        {/*
          ⚠️ 高さの上限は**親**に持たせ、ScrollView は残りを埋めるだけにする。
             ScrollView 自身に maxHeight を付けると 1 回目の指が空振りする
             （`docs/traps.md` のシート）。
        */}
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.head}>
            <Text style={styles.title}>送信待ちの集金</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
              <Ionicons name="close" size={20} color={color.textMuted} />
            </Pressable>
          </View>

          {failed.length > 0 && (
            <Text style={styles.lead}>
              送信できなかった集金があります。もう一度送るか、破棄してください。
              {"\n"}
              権限がないなど、送っても通らない理由のときは破棄してください。
            </Text>
          )}

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: spacing.sm }}>
            {items.map((item) => (
              <Row
                key={item.id}
                item={item}
                confirming={confirming === item.id}
                onAskDiscard={() => setConfirming(item.id)}
                onCancelDiscard={() => setConfirming(null)}
                onDiscard={() => {
                  setConfirming(null);
                  onDiscard(item.id);
                }}
              />
            ))}
          </ScrollView>

          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
            <Text style={styles.retryLabel}>すべてもう一度送る</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * 1 件ぶん。
 *
 * ⚠️ **金額は `payload.totalFunds` そのままではない。** あちらは
 *    **現金ぶん**で、キャッシュレスはサーバが足し直す（`src/offline/types.ts`）。
 *    画面に出すのは総額なので、ここで足してから描く。
 * ⚠️ **機種別入力では集金レベルの `cashless` が空配列**なので、両方足しても
 *    二重にはならない（どちらか一方しか入らない）。
 */
function Row({
  item,
  confirming,
  onAskDiscard,
  onCancelDiscard,
  onDiscard,
}: {
  item: OutboxItem;
  confirming: boolean;
  onAskDiscard: () => void;
  onCancelDiscard: () => void;
  onDiscard: () => void;
}) {
  const failed = item.status === "failed";
  const machineCashless = (item.payload.fundsArray ?? []).reduce(
    (sum, entry) => sum + (entry.cashless ?? []).reduce((s, c) => s + (c.amount || 0), 0),
    0
  );
  const cashless = (item.payload.cashless ?? []).reduce((sum, c) => sum + (c.amount || 0), 0);
  const total = (item.payload.totalFunds || 0) + cashless + machineCashless;

  return (
    <View style={[styles.row, failed && styles.rowFailed]}>
      <View style={styles.rowHead}>
        <Text style={styles.rowStore} numberOfLines={1}>
          {item.payload.store}店
        </Text>
        <Text style={styles.rowAmount}>¥{total.toLocaleString()}</Text>
      </View>
      <Text style={styles.rowMeta}>
        {formatJstDate(item.payload.date)}
        {failed ? "送信できませんでした" : "送信待ち"}
      </Text>
      {/* ⚠️ サーバの日本語メッセージをそのまま出す。「権限がありません」まで
             見せないと、破棄すべきなのか電波待ちなのか区別が付かない */}
      {failed && item.lastError && <Text style={styles.rowError}>{item.lastError}</Text>}

      {confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>この集金を破棄しますか？入力した内容は戻せません。</Text>
          <View style={styles.confirmActions}>
            <Pressable onPress={onCancelDiscard} hitSlop={6} style={styles.confirmButton}>
              <Text style={styles.confirmCancel}>やめる</Text>
            </Pressable>
            <Pressable onPress={onDiscard} hitSlop={6} style={styles.confirmButton}>
              <Text style={styles.confirmDanger}>破棄する</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={onAskDiscard} hitSlop={6} style={styles.discard}>
          <Ionicons name="trash-outline" size={13} color={color.red400} />
          <Text style={styles.discardLabel}>破棄する</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    maxHeight: "85%",
    backgroundColor: color.cardBg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: { flexDirection: "row", alignItems: "center" },
  title: { flex: 1, fontFamily: font.uiBold, fontSize: 17, color: color.tealDeeper },
  close: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  lead: { fontFamily: font.ui, fontSize: 12, lineHeight: 18, color: color.textMuted },

  row: {
    borderRadius: radius.lg,
    borderWidth: 1,
    /* ⚠️ 白地の線に color.divider を使わない（1.07:1 で見えない） */
    borderColor: color.border,
    padding: spacing.md,
    gap: 2,
  },
  rowFailed: { borderColor: color.red400, backgroundColor: color.red50 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowStore: { flex: 1, fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  rowAmount: { ...numeric, fontSize: 15, color: color.tealDeeper },
  rowMeta: { fontFamily: font.ui, fontSize: 11, color: color.textMuted },
  rowError: { fontFamily: font.uiBold, fontSize: 11, color: color.red400, marginTop: 2 },

  discard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
    minHeight: 32,
  },
  discardLabel: { fontFamily: font.uiBold, fontSize: 12, color: color.red400 },

  confirm: { marginTop: spacing.xs, gap: spacing.xs },
  confirmText: { fontFamily: font.ui, fontSize: 11, lineHeight: 16, color: color.textMain },
  confirmActions: { flexDirection: "row", gap: spacing.lg },
  confirmButton: { minHeight: 32, justifyContent: "center" },
  confirmCancel: { fontFamily: font.uiBold, fontSize: 12, color: color.textMuted },
  confirmDanger: { fontFamily: font.uiBold, fontSize: 12, color: color.red400 },

  retry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: HIT_SIZE,
    borderRadius: radius.lg,
    backgroundColor: color.teal,
  },
  retryLabel: { fontFamily: font.uiBold, fontSize: 15, color: "#FFFFFF" },
});
