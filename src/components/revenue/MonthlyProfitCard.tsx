import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useExpenses } from "@/api/queries";
import { ProfitBarChart } from "@/components/revenue/charts";
import { ChartPager, PagerArrow } from "@/components/revenue/ChartPager";
import { usePeriodPager } from "@/components/revenue/usePeriodPager";
import { buildProfitPoints, profitMargin, sumProfitPoints } from "@/components/revenue/profitSeries";
import { monthLabel, monthStartEpoch, type MonthRange } from "@/components/revenue/monthIndex";
import { Card, Muted } from "@/components/common/ui";
import { color, font, numeric, radius, spacing } from "@/theme/tokens";
import type { StoreRevenue } from "@/api/types";

/**
 * 月別利益カード（売上 − 経費）。月次サマリーの後継として 2026-08-03 に入れた。
 *
 * ⚠️ **経費を使わない組織には出さない。** 経費が常に 0 で、利益＝売上の棒が
 *    月別売上と同じ形で 2 枚並ぶだけになる。出し分けは呼び出し側
 *    （`organization.expensesEnabled`）。
 *
 * ⚠️ **店舗を指定すると「その店舗に紐づけた経費」だけを引く。**
 *    `laundry_id` が NULL の組織全体の経費（税理士費用など）は**入らない。**
 *    店舗ごとに按分する規則が無いので、勝手に割り振らずカードに明記している。
 */
export function MonthlyProfitCard({
  stores,
  isLoading,
  storeId,
}: {
  /** 遡れる下限（最初の集金がある月）を決めるのに使う */
  stores: StoreRevenue[];
  isLoading: boolean;
  /**
   * 1 店舗だけを見るときの店舗 ID。
   * ⚠️ **店舗別の収益ページでは必ず渡すこと。** 省くと組織全体の売上と経費が出る。
   */
  storeId?: string;
}) {
  const router = useRouter();
  const { range, prevRange, nextRange, canPrev, canNext, onPage, pageKey, chart, prevChart, nextChart } =
    usePeriodPager({ stores, storeId });

  /*
    経費も前後ぶんまで取る。⚠️ **取らないと、指で引いている最中に見える隣の期間が
    「経費 0 円 ＝ 利益が売上と同じ」で描かれる。** 送りきった瞬間に棒が縮むので、
    一瞬だけ嘘の数字が見えることになる。
    ⚠️ react-query のキャッシュに乗るので、行き来しても取り直しは起きない。
  */
  const expenses = useMonthExpenses(range, storeId, true);
  const prevExpenses = useMonthExpenses(prevRange, storeId, canPrev);
  const nextExpenses = useMonthExpenses(nextRange, storeId, canNext);

  const points = buildProfitPoints(chart.data, expenses.data, range);
  const totals = sumProfitPoints(points);
  const margin = profitMargin(totals.revenue, totals.profit);
  const negative = totals.profit < 0;

  const busy = isLoading || ((chart.isLoading || expenses.isLoading) && !chart.data);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={styles.headRow}>
        <Text style={styles.cardTitle}>月別利益</Text>
        <Muted style={styles.formula}>売上 − 経費</Muted>
      </View>

      <View style={styles.periodRow}>
        <PagerArrow direction={-1} disabled={!canPrev} onPress={() => onPage(-1)} />
        <View style={styles.periodBody}>
          <Muted style={styles.totalLabel}>
            利益（{monthLabel(range.start)} 〜 {monthLabel(range.end)}）
          </Muted>
          <View style={styles.totalRow}>
            <Text style={[styles.totalValue, negative && { color: color.red400 }]}>
              {negative ? "−" : ""}¥{Math.abs(totals.profit).toLocaleString()}
            </Text>
            {/* ⚠️ 売上が 0 の期間では出さない（margin が null）。0 除算で Infinity になる */}
            {margin !== null && <Muted style={styles.margin}>利益率 {margin}%</Muted>}
          </View>
        </View>
        <PagerArrow direction={1} disabled={!canNext} onPress={() => onPage(1)} />
      </View>

      {busy ? (
        <ActivityIndicator color={color.teal} style={{ marginVertical: spacing.xl }} />
      ) : chart.isError || expenses.isError ? (
        <Muted style={styles.fallbackNote}>利益を計算できませんでした</Muted>
      ) : (
        <>
          <ChartPager
            pageKey={pageKey}
            canPrev={canPrev}
            canNext={canNext}
            onPage={onPage}
            prev={
              canPrev ? (
                <ProfitBarChart
                  data={buildProfitPoints(prevChart.data, prevExpenses.data, prevRange)}
                />
              ) : null
            }
            current={<ProfitBarChart data={points} />}
            next={
              canNext ? (
                <ProfitBarChart
                  data={buildProfitPoints(nextChart.data, nextExpenses.data, nextRange)}
                />
              ) : null
            }
          />

          <View style={styles.summaryRow}>
            <SummaryCell label="売上" value={totals.revenue} />
            <SummaryCell label="経費" value={totals.expense} />
          </View>

          {/*
            ⚠️ **店舗別では「組織全体の経費」が入らないことを必ず書く。**
               書かないと、経費画面の合計と店舗ページの経費が合わない理由が分からない。
          */}
          <Muted style={styles.note}>
            {storeId
              ? "この店舗に紐づけた経費だけを引いています。組織全体の経費は含まれません。"
              : "毎月の固定費も計上されます。"}
          </Muted>

          {/*
            経費の入口。**このカードの中に置く**（2026-08-03）。

            ⚠️ **利益のグラフのすぐ下が唯一まともな置き場所。** 棒が「売上 − 経費」
               なので、経費を足したり直したりしたくなるのはここを見た瞬間。
               収益ページの上のほうに置いていたときは、グラフを見てから
               画面を遡ることになっていた。
            ⚠️ **店舗別の収益ページにも同じカードが出る**ので、ここに置けば
               両方に一度で乗る（`StoreChartTabs` の「月別利益」タブ）。
            ⚠️ **タブをまたぐ遷移になる**（店舗タブ → 収益タブ）。
               `(tabs)/_layout.tsx` の `backToTabRoot("/revenue")` が
               「収益タブを押したら先頭へ」を持っているので戻れる。**外さないこと。**
            ⚠️ **「追加」をここに並べない**（2026-08-03 に一度置いて外した）。
               経費を足す入口は**店舗詳細の「経費を追加」**と経費画面の「＋」。
               グラフのカードに登録の導線まで積むと、カードの役目が
               「利益を見る」から曖昧になる。
          */}
          <Pressable
            onPress={() => router.push("/revenue/expenses")}
            accessibilityRole="button"
            accessibilityLabel="経費を見る"
            style={({ pressed }) => [styles.expensesOpen, pressed && styles.expensesPressed]}
          >
            <View style={styles.expensesIcon}>
              <Ionicons name="receipt-outline" size={18} color={color.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.expensesTitle}>経費</Text>
              {/* ⚠️ 経費が 1 円も無いと「利益＝売上」の棒になる。その理由をここで言う */}
              <Muted style={styles.expensesNote}>
                {totals.expense === 0
                  ? "まだ登録がありません。登録すると利益が出ます"
                  : "登録・修正はこちら"}
              </Muted>
            </View>
            <Ionicons name="chevron-forward" size={16} color={color.cyan300} />
          </Pressable>
        </>
      )}
    </Card>
  );
}

/**
 * 期間ぶんの経費。
 *
 * ⚠️ **`to` は「含む」（`lte`）。** `/funds/chart` の `to` は排他なので**向きが逆**。
 *    翌月 1 日をそのまま渡すと**翌月 1 日の経費が 1 件だけ混ざる**ので 1 ミリ秒引く。
 */
function useMonthExpenses(range: MonthRange, storeId: string | undefined, enabled: boolean) {
  return useExpenses(
    monthStartEpoch(range.start),
    monthStartEpoch(range.end + 1) - 1,
    storeId,
    enabled
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCell}>
      <Muted style={styles.summaryLabel}>{label}</Muted>
      <Text style={styles.summaryValue}>¥{value.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  cardTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
  formula: { fontSize: 11 },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodBody: { flex: 1 },
  totalLabel: { fontSize: 12 },
  totalRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  totalValue: { ...numeric, fontSize: 26, color: color.tealDeeper },
  margin: { fontSize: 11 },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  summaryCell: { flex: 1 },
  summaryLabel: { fontSize: 11 },
  summaryValue: { ...numeric, fontSize: 15, color: color.textMain, marginTop: 2 },
  note: { fontSize: 11, lineHeight: 16, marginTop: spacing.sm },

  /* ⚠️ カードの中なので影は付けない（外枠の Card が持っている） */
  expensesOpen: {
    flexDirection: "row",
    marginTop: spacing.md,
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    backgroundColor: color.appBg,
  },
  expensesPressed: { opacity: 0.85, backgroundColor: color.cyan50 },
  expensesIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: color.cyan50,
    alignItems: "center",
    justifyContent: "center",
  },
  expensesTitle: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  expensesNote: { fontSize: 11, marginTop: 1 },
  fallbackNote: { fontSize: 11, marginVertical: spacing.xl, textAlign: "center" },
});
