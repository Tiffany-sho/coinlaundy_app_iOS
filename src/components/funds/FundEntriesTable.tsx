import { StyleSheet, Text, TextInput, View } from "react-native";
import { Muted } from "@/components/common/ui";
import { entryAmount, COIN_VALUE } from "@/shared/collectMoney";
import { color, font, radius, spacing, numeric } from "@/theme/tokens";
import type { FundEntry } from "@/api/types";

/**
 * 設備ごとの集金額。本家 MachineAndFundsList.jsx の表。
 *
 * ⚠️ 入力するのは**硬貨の枚数**であって円ではない。金額にするときは必ず ×100 する
 *    （`entryAmount` / `calcTotalFunds` を通すこと）。
 * ⚠️ 明細を持たない集金データ（合計だけの登録）は枚数ではなく**円**を直接入れる。
 *    本家 TotalFundsList.jsx も fundsArray を空配列で保存している。
 */
export function FundEntriesTable({
  entries,
  editing,
  coinDraft,
  onCoinChange,
  displayTotal,
}: {
  entries: FundEntry[];
  editing: boolean;
  /** 編集中の枚数。TextInput に合わせて文字列で持つ */
  coinDraft: Record<string, string>;
  onCoinChange: (id: string, digitsOnly: string) => void;
  displayTotal: number;
}) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHead}>
        <Text style={[styles.th, { flex: 1 }]}>設備</Text>
        <Text style={[styles.th, styles.right]}>売上</Text>
      </View>

      {entries.map((entry) => {
        const coins = editing ? toInt(coinDraft[entry.id]) : (entry.funds ?? 0);
        return (
          <View key={entry.id} style={styles.tableRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.machineName}>{entry.name}</Text>
              <Text style={styles.machineHint}>
                {coins.toLocaleString()}枚 × {COIN_VALUE}円
              </Text>
            </View>

            {editing ? (
              <View style={styles.inputGroup}>
                <TextInput
                  style={styles.input}
                  value={coinDraft[entry.id] ?? ""}
                  /* 数字以外は弾く。本家は入力後に「数字以外の文字が含まれています」を
                     出すが、テンキー入力では最初から入らないようにするほうが早い */
                  onChangeText={(text) => onCoinChange(entry.id, text.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  placeholder="0"
                  placeholderTextColor={color.textFaint}
                  selectTextOnFocus
                />
                <View style={styles.addon}>
                  <Text style={styles.addonText}>枚</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.amount}>¥{entryAmount(entry).toLocaleString()}</Text>
            )}
          </View>
        );
      })}

      <View style={[styles.tableRow, styles.tableFoot]}>
        <Text style={styles.footLabel}>合計</Text>
        <Text style={styles.footValue}>¥{displayTotal.toLocaleString()}</Text>
      </View>
    </View>
  );
}

/** 明細を持たない集金データ。⚠️ こちらの単位は枚数ではなく円 */
export function FundTotalOnlyInput({
  editing,
  value,
  onChange,
}: {
  editing: boolean;
  value: string;
  onChange: (digitsOnly: string) => void;
}) {
  if (!editing) {
    return <Muted>この集金は合計金額だけで登録されています。設備ごとの内訳はありません。</Muted>;
  }

  return (
    <View style={styles.inputGroup}>
      <View style={styles.addon}>
        <Text style={[styles.addonText, { fontSize: 17 }]}>¥</Text>
      </View>
      <TextInput
        style={[styles.input, styles.totalInput]}
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder="合計金額を入力してください"
        placeholderTextColor={color.textFaint}
      />
    </View>
  );
}

function toInt(value: string | undefined): number {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: color.cyan100,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: color.cardBg,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.gray50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  th: { fontFamily: font.uiBold, fontSize: 12, color: color.textMuted },
  right: { textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  tableFoot: { backgroundColor: color.cyan50 },
  footLabel: { flex: 1, fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  footValue: { ...numeric, fontSize: 18, color: color.teal },
  machineName: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  machineHint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, marginTop: 2 },
  amount: { ...numeric, fontSize: 16, color: color.textMain },

  inputGroup: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: radius.card - 6,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    backgroundColor: color.cardBg,
    overflow: "hidden",
  },
  addon: {
    minWidth: 40,
    paddingHorizontal: spacing.md,
    backgroundColor: color.cyan100,
    alignItems: "center",
    justifyContent: "center",
  },
  addonText: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
  input: {
    minWidth: 96,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    ...numeric,
    fontSize: 16,
    color: color.textMain,
    textAlign: "right",
  },
  /** 合計だけの集金データはテンキーが 1 つしかないので、横幅いっぱいに広げる */
  totalInput: { flex: 1, textAlign: "left", fontFamily: font.ui },
});
