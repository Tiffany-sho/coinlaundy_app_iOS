import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Card, MoneyText, Muted } from "@/components/common/ui";
import { formatJstDate } from "@/shared/date";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 総額収益。Web の StoreRevenueChart にある「全店舗累計」に当たる。
 * 期間の切り替えに関係なく変わらない数字なので、タブの外（常時表示）に置く。
 *
 * ⚠️ **期間は 1 行使い切る。** 以前は「期間 / 店舗数 / 最終集金日」を横 3 列にして
 *    期間だけ `26年7月\n〜 26年7月` と 2 行に折っていたが、
 *    列幅が 1/3 しか無いので西暦を 2 桁に削っても窮屈で、`〜` が行頭に落ちて
 *    範囲なのか単独の月なのか読み取れなかった。開始 → 終了は横に読ませる。
 *
 * ⚠️ 期間の表示は月単位。金額は全期間（/funds/summary/stores）だが、
 *    日付を持つ集計は月次（/funds/summary/monthly＝過去 2 年）しかなく、
 *    しかも月単位に畳まれているため「最初の集金日」を日まで特定できない。
 *    2 年より前にも集金がある場合は総額と月次の総和がずれるので、それを検知して
 *    「これより前にも記録あり」と添える。日付まで出すには BFF の対応が要る（報告済み）。
 *    最終集金日だけは売上履歴（日付降順）の先頭から日単位で分かる。
 */
export function TotalRevenueCard({
  title = "総額収益",
  total,
  countLabel,
  countValue,
  firstMonth,
  lastMonth,
  hasOlderThanWindow,
  latestFundDate,
  isLoading,
}: {
  /** 店舗別の画面では「〇〇店の売上総額」のように差し替える */
  title?: string;
  total: number;
  /** 2 列目の見出し。全体版は「店舗数」、店舗版は「集金回数」 */
  countLabel: string;
  countValue: string;
  firstMonth?: string;
  lastMonth?: string;
  hasOlderThanWindow: boolean;
  latestFundDate: number | null;
  isLoading: boolean;
}) {
  const hasPeriod = Boolean(firstMonth && lastMonth);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={styles.cardTitle}>{title}</Text>
      {isLoading ? (
        <ActivityIndicator color={color.teal} style={{ alignSelf: "flex-start" }} />
      ) : (
        <>
          {/* ¥ を分けるのはホームのヒーローだけ（ui.tsx の MoneyText のコメント参照） */}
          <MoneyText value={total} size={30} tone="deeper" />

          {/* 期間は横 1 行。開始 → 矢印 → 終了の順で目が流れる */}
          <View style={styles.periodRow}>
            <Text style={styles.periodLabel}>期間</Text>
            {hasPeriod ? (
              <View style={styles.periodValue}>
                <Text style={styles.month}>{formatMonth(firstMonth!)}</Text>
                <Text style={styles.tilde}>〜</Text>
                <Text style={styles.month}>{formatMonth(lastMonth!)}</Text>
              </View>
            ) : (
              <Text style={styles.month}>{total > 0 ? "全期間" : "—"}</Text>
            )}
          </View>
          {hasOlderThanWindow && (
            <Muted style={styles.periodNote}>これより前にも集金の記録があります</Muted>
          )}

          <View style={styles.stats}>
            <Stat label={countLabel} value={countValue} />
            <Stat
              label="最終集金日"
              value={latestFundDate !== null ? formatJstDate(latestFundDate) : "—"}
              divided
            />
          </View>
        </>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  divided,
}: {
  label: string;
  value: string;
  /** 左に区切り線を引くか。先頭列では引かない */
  divided?: boolean;
}) {
  return (
    <View style={[styles.stat, divided && styles.statDivided]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/** "2026-07" → "2026年7月"。1 行使えるので西暦は削らない */
function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

const styles = StyleSheet.create({
  cardTitle: {
    fontFamily: font.uiBold,
    fontSize: 14,
    color: color.tealDeeper,
    marginBottom: spacing.md,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  periodLabel: { fontFamily: font.ui, fontSize: 11, color: color.textFaint },
  periodValue: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  /* ⚠️ 年月に numeric（Inter）を使わない。「年」「月」のグリフを持たないので
        漢字だけシステムフォントに落ちて 1 行の中で書体が混ざる */
  month: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  tilde: { fontFamily: font.ui, fontSize: 12, color: color.textFaint },
  periodNote: { fontSize: 10, marginTop: 4, textAlign: "right" },
  stats: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  stat: { flex: 1, paddingHorizontal: spacing.sm },
  statDivided: { borderLeftWidth: 1, borderLeftColor: color.divider },
  statLabel: { fontFamily: font.ui, fontSize: 10, color: color.textFaint, marginBottom: 2 },
  statValue: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain, lineHeight: 17 },
});
