import { StyleSheet, Text, View } from "react-native";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { MachineBreakdown } from "@/api/types";

/**
 * 機器ごとの売上を横棒で並べる。
 *
 * ⚠️ **縦棒にしない。** 設備名（「洗濯機（大）」など）が x 軸に並ぶと必ず切り詰められる。
 *    台数は月数と違って 10〜20 で頭打ちなので、縦に積むほうが素直に収まる。
 *
 * ⚠️ 依存は足していない。`charts.tsx` と同じく素の View だけで描く。
 */
export function MachineBreakdownChart({ data }: { data: MachineBreakdown | undefined }) {
  if (!data) return <Text style={styles.empty}>表示できるデータがありません</Text>;

  /*
    ⚠️ **`?? 0` を必ず通す。** react-query の永続キャッシュ（MMKV）が
       前のバージョンの応答を最大 7 日復元するので、あとから足したキーは
       型が新しくても実体が undefined になる。undefined を足すと NaN が画面に出る。
  */
  const totalMode = data.unattributed?.totalMode ?? 0;
  const other = data.unattributed?.other ?? 0;
  const total = data.total ?? 0;

  const machines = data.machines ?? [];
  const hasAnything = total > 0;

  if (!hasAnything) {
    return <Text style={styles.empty}>この期間の集金記録はありません</Text>;
  }

  /* 棒の長さは「最大の台」を基準にする。総額基準だと 1 台が突出したとき他が潰れる */
  const max = Math.max(...machines.map((m) => m.total), 1);

  return (
    <View>
      <View style={styles.readout}>
        <Text style={styles.readoutLabel}>期間の合計</Text>
        <Text style={styles.readoutValue}>¥{total.toLocaleString()}</Text>
      </View>

      <View style={styles.rows}>
        {machines.map((machine) => {
          /* ⚠️ 分母は総額。棒の長さ（max 基準）と割合の分母が違うのは意図的で、
                「他の台と比べてどうか」と「全体の何割か」を同時に出すため */
          const share = total > 0 ? (machine.total / total) * 100 : 0;
          const widthPct = Math.max((machine.total / max) * 100, machine.total > 0 ? 2 : 0);

          return (
            <View key={machine.id} style={styles.row}>
              <View style={styles.rowHead}>
                <Text style={styles.machineName} numberOfLines={1}>
                  {machine.name}
                </Text>
                <Text style={styles.machineAmount}>¥{machine.total.toLocaleString()}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${widthPct}%` }]} />
              </View>
              <Text style={styles.share}>{share.toFixed(1)}%</Text>
            </View>
          );
        })}
      </View>

      {/*
        ⚠️ **0 でないときは必ず出す。** 合計入力モードの集金は fundsArray が空で
           機器に割り振れないため、注記が無いと「機器別の和が総額収益と違う」に見える。
           数字の食い違いを黙って放置しない。
      */}
      {(totalMode !== 0 || other !== 0) && (
        <View style={styles.note}>
          <Text style={styles.noteTitle}>機器の内訳がないぶん</Text>
          {totalMode !== 0 && (
            <Text style={styles.noteRow}>
              合計金額で登録した集金　¥{totalMode.toLocaleString()}
            </Text>
          )}
          {/* ⚠️ 負の値もそのまま出す。潰すと過去データのずれに気づけなくなる */}
          {other !== 0 && (
            <Text style={styles.noteRow}>その他　¥{other.toLocaleString()}</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontFamily: font.ui,
    fontSize: 13,
    color: color.textFaint,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  readout: { marginBottom: spacing.md },
  readoutLabel: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  readoutValue: { ...numeric, fontSize: 24, color: color.tealDeeper, marginTop: 2 },

  rows: { gap: spacing.md },
  row: { gap: 4 },
  rowHead: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  machineName: { flex: 1, fontFamily: font.ui, fontSize: 13, color: color.textMain },
  /* ⚠️ numeric を丸ごと展開する。fontFamily だけだと fontVariant が落ちて桁が揃わない */
  machineAmount: { ...numeric, fontSize: 13, color: color.tealDeeper },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.divider,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: color.teal },
  share: { ...numeric, fontSize: 10, color: color.textFaint, textAlign: "right" },

  note: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: color.gray50,
    gap: 2,
  },
  noteTitle: { fontFamily: font.uiBold, fontSize: 11, color: color.textMuted },
  noteRow: { ...numeric, fontSize: 11, color: color.textMuted },
});
