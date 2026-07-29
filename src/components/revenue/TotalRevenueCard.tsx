import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Card, MoneyText, Muted } from "@/components/common/ui";
import { formatJstDate } from "@/shared/date";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 総額収益。Web の StoreRevenueChart にある「全店舗累計」に当たる。
 * 期間の切り替えに関係なく変わらない数字なので、タブの外（常時表示）に置く。
 *
 * 金額の下に「期間 / 店舗数 / 最終集金日」を横 3 列で並べる。
 * ⚠️ 区切り線は borderLeftWidth を 2 列目・3 列目にだけ付ける。全部に付けると
 *    左端に浮いた線が 1 本増える。色は divider（トークンで一番薄い線）。
 *
 * ⚠️ 期間の表示は月単位。金額は全期間（/funds/summary/stores）だが、
 *    日付を持つ集計は月次（/funds/summary/monthly＝過去 2 年）しかなく、
 *    しかも月単位に畳まれているため「最初の集金日」を日まで特定できない。
 *    2 年より前にも集金がある場合は総額と月次の総和がずれるので、それを検知して
 *    「〜より前」と濁す。日付まで出すには BFF の対応が要る（報告済み）。
 *    最終集金日だけは売上履歴（日付降順）の先頭から日単位で分かるので添える。
 */
export function TotalRevenueCard({
  total,
  storeCount,
  firstMonth,
  lastMonth,
  hasOlderThanWindow,
  latestFundDate,
  isLoading,
}: {
  total: number;
  storeCount: number;
  firstMonth?: string;
  lastMonth?: string;
  hasOlderThanWindow: boolean;
  latestFundDate: number | null;
  isLoading: boolean;
}) {
  const period =
    firstMonth && lastMonth
      ? `${shortMonth(firstMonth)}\n〜 ${shortMonth(lastMonth)}`
      : storeCount > 0
        ? "全期間"
        : "—";

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={styles.cardTitle}>総額収益</Text>
      {isLoading ? (
        <ActivityIndicator color={color.teal} style={{ alignSelf: "flex-start" }} />
      ) : (
        <>
          {/* ¥ を分けるのはホームのヒーローだけ（ui.tsx の MoneyText のコメント参照） */}
          <MoneyText value={total} size={30} tone="deeper" />

          <View style={styles.stats}>
            <Stat label="期間" value={period} note={hasOlderThanWindow ? "これより前にも記録あり" : undefined} />
            <Stat label="店舗数" value={storeCount > 0 ? `${storeCount}店舗` : "—"} divided />
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
  note,
  divided,
}: {
  label: string;
  value: string;
  /** 値の下に添える但し書き。無ければ出さない */
  note?: string;
  /** 左に区切り線を引くか。先頭列では引かない */
  divided?: boolean;
}) {
  return (
    <View style={[styles.stat, divided && styles.statDivided]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {note ? <Muted style={styles.statNote}>{note}</Muted> : null}
    </View>
  );
}

/** "2026-07" → "26年7月"。3 列に収めるため西暦は下 2 桁にする */
function shortMonth(month: string): string {
  const [year, m] = month.split("-");
  return `${year.slice(2)}年${Number(m)}月`;
}

const styles = StyleSheet.create({
  cardTitle: {
    fontFamily: font.uiBold,
    fontSize: 14,
    color: color.tealDeeper,
    marginBottom: spacing.md,
  },
  stats: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  /* 3 列を均等に。中身の長さが違っても幅は動かさない */
  stat: { flex: 1, paddingHorizontal: spacing.sm },
  statDivided: { borderLeftWidth: 1, borderLeftColor: color.divider },
  statLabel: { fontFamily: font.ui, fontSize: 10, color: color.textFaint, marginBottom: 2 },
  statValue: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain, lineHeight: 17 },
  statNote: { fontSize: 9, marginTop: 2, lineHeight: 12 },
});
