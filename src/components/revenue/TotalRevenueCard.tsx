import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Card, MoneyText } from "@/components/common/ui";
import { formatJstDate } from "@/shared/date";
import { color, font, spacing } from "@/theme/tokens";

/**
 * 総額収益。Web の StoreRevenueChart にある「全店舗累計」に当たる。
 * 期間の切り替えに関係なく変わらない数字なので、タブの外（常時表示）に置く。
 *
 * 収益タブと店舗別の収益ページで**同じカード・同じ見出し**を使う。どちらの画面かは
 * ページのヘッダ（「◯◯店の収益」）で分かるので、見出しに店舗名を混ぜない。
 *
 * ⚠️ **期間は見出しの右に置く。ラベルは付けない。**
 *    以前は「期間 / 店舗数 / 最終集金日」を横 3 列にして期間だけ 2 行に折っていたが、
 *    列幅が 1/3 しか無いので西暦を 2 桁に削っても窮屈で、`〜` が行頭に落ちて
 *    範囲なのか単独の月なのか読み取れなかった。金額の直上に横並びで置けば
 *    「この期間の合計」と一息で読める。
 *
 * ⚠️ **期間は /funds/summary/stores の firstDate / lastDate から作る。**
 *    月次サマリー（/funds/summary/monthly）は前年同月比のため**過去 2 年に固定**で、
 *    しかも月単位に畳んだあとなので日にちが分からない。以前はそちらを使っていたため、
 *    2 年より前に集金があると期間を出せず「これより前にも記録あり」と濁すしかなかった。
 *    その但し書きはもう要らない（濁す理由が無くなったので消してある）。
 */
export function TotalRevenueCard({
  total,
  stats,
  firstDate,
  lastDate,
  isLoading,
}: {
  total: number;
  /** 下段に横並びで出す項目。全体版は「店舗数 / 集金回数」、店舗版は「集金回数」だけ */
  stats: { label: string; value: string }[];
  /** 最初 / 最後の集金日。JST 深夜 0 時の epoch（ミリ秒）。1 件も無ければ null */
  firstDate: number | null;
  lastDate: number | null;
  isLoading: boolean;
}) {
  /**
   * ⚠️ `!== null` だけで判定しない。永続キャッシュ（MMKV）に残っている
   *    前のバージョンの応答にはこの項目が無く、undefined で渡ってくる。
   *    そのまま formatJstDate に入ると「NaN/NaN/NaN」が出る。
   */
  const hasPeriod = Number.isFinite(firstDate) && Number.isFinite(lastDate);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={styles.headRow}>
        <Text style={styles.cardTitle}>総額収益</Text>
        {/* ⚠️ 集金が 1 件も無いときは何も出さない。ラベルが無いので「—」だけ置くと
               何の「—」か分からない */}
        {!isLoading && hasPeriod && (
          <View style={styles.period}>
            <Text style={styles.date}>{formatJstDate(firstDate as number)}</Text>
            <Text style={styles.tilde}>〜</Text>
            <Text style={styles.date}>{formatJstDate(lastDate as number)}</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={color.teal} style={{ alignSelf: "flex-start" }} />
      ) : (
        <>
          {/* ¥ を分けるのはホームのヒーローだけ（ui.tsx の MoneyText のコメント参照） */}
          <MoneyText value={total} size={30} tone="deeper" />

          <View style={styles.stats}>
            {stats.map((stat, i) => (
              <Stat key={stat.label} label={stat.label} value={stat.value} divided={i > 0} />
            ))}
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

const styles = StyleSheet.create({
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
  /* ⚠️ shrink を付ける。期間が長い（西暦 4 桁 + 2 桁日）ときに見出しを押し出さない */
  period: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  /* ⚠️ 日付に numeric（Inter）を使わない。他の日付表示（font.ui 系）と並んだときに
        書体が揃わない */
  date: { fontFamily: font.uiBold, fontSize: 12, color: color.textMuted },
  tilde: { fontFamily: font.ui, fontSize: 11, color: color.textFaint },
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
