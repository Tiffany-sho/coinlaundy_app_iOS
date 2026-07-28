import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Muted } from "./ui";
import { color, font, radius, shadow, spacing, HIT_SIZE } from "@/theme/tokens";
import type { Machine } from "@/api/types";

/**
 * 設置機種の詳細シート。店舗詳細の「設置機種」タイルから開く。
 *
 * Web の HaveMachines.jsx（設備情報カード → Drawer「設備一覧」）を移したもの。
 * 出方と見た目は StateEditSheet.tsx に合わせてある（下から出る Modal + teal-pale の
 * ヘッダ + グラデーションのアイコン）。同じ店舗詳細から開くシートで作法がずれると
 * 別のアプリのように見えるため。
 *
 * ⚠️ ここで扱うのは laundry_store.machines（設置している機種の台帳）で、
 *    laundry_state.machines（故障中かどうか）とは**別のテーブルの別の配列**。
 *    名前が同じ machines でも中身が違う（こちらは num / comment、あちらは break / comment）。
 *    故障状況は「設備状況」タイル → StateEditSheet の担当なので、ここでは触らない。
 *
 * ⚠️ 読むだけのシート。更新はしないので Outbox・オフライン判定とも無関係。
 */
export function MachineListSheet({
  visible,
  storeName,
  machines,
  onClose,
}: {
  visible: boolean;
  /** 「〜店」を付ける前の店舗名 */
  storeName: string;
  machines: Machine[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHeader}>
            <LinearGradient
              colors={["#0891B2", "#0E7490"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sheetIcon}
            >
              <Ionicons name="construct" size={18} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.sheetTitle}>設備一覧（{storeName}店）</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.sheetClose}>
              <Ionicons name="close" size={20} color={color.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: spacing.lg }}>
            {machines.length === 0 ? (
              <Muted>設備が登録されていません。</Muted>
            ) : (
              machines.map((machine, i) => (
                // 店舗を保存し直すたびに id は振り直される（Web の useStoreSubmit.js が
                // crypto.randomUUID() で毎回作る）ので、念のため添字も混ぜて一意にする
                <MachineRow key={`${machine.id ?? machine.name}-${i}`} machine={machine} />
              ))
            )}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <Pressable onPress={onClose} style={styles.sheetGhost}>
              <Text style={styles.sheetGhostLabel}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * 機種 1 件。Web の Drawer.Body の中の Box（左に teal の帯 + 名前 + バッジ）と同じ組み方。
 */
function MachineRow({ machine }: { machine: Machine }) {
  const count = readNumber(machine.num);
  const note = readText(machine.comment);

  return (
    <View style={styles.machineBox}>
      <Text style={styles.machineName}>{machine.name}</Text>
      <View style={styles.badgeRow}>
        {count !== null && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>台数: {count}</Text>
          </View>
        )}
        {/* comment は店舗が入力する機械の利用料金・メモ（Web の入力欄は
            「価格帯・コメント」、例）20kg/1000円, 8分/100円）。空なら出さない */}
        {note !== "" && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>価格: {note}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * laundry_store.machines は Web が JSON をそのまま入れているぶん型が緩い
 * （Machine の num / comment は unknown）。数字・文字列として出せるものだけ出す。
 */
function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: color.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...shadow.hero,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: color.tealPale,
    padding: spacing.lg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: { flex: 1, fontFamily: font.uiBold, fontSize: 16, color: color.tealDeeper },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },

  // Web は左に 4px の teal の帯を引いている（borderLeft="4px solid var(--teal)"）
  machineBox: {
    backgroundColor: color.cardBg,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: color.teal,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  machineName: { fontFamily: font.uiBold, fontSize: 16, color: color.textMain },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  badge: {
    backgroundColor: color.tealPale,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  badgeText: { fontFamily: font.uiBold, fontSize: 12, color: color.tealDeeper },

  sheetFooter: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  sheetGhost: {
    flex: 1,
    minHeight: HIT_SIZE,
    borderRadius: radius.card - 6,
    borderWidth: 2,
    borderColor: color.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetGhostLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMuted },
});
