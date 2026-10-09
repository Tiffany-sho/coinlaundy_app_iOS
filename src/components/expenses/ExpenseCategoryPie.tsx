import { StyleSheet, Text, View } from "react-native";
import { categorySlices, pieChunks, type CategorySlice } from "@/components/expenses/categoryPie";
import { Muted } from "@/components/common/ui";
import { color, font, numeric, spacing } from "@/theme/tokens";
import type { Expense } from "@/api/types";

/**
 * カテゴリ別の内訳をドーナツで出す。
 *
 * ⚠️ **ファイル名を `CategoryPie.tsx` にしない。** 組み立ての `categoryPie.ts` と
 *    **大文字小文字しか違わず、Windows の tsc が同一視して TS1149 になる**
 *    （`docs/traps.md` の Windows）。`historyRows.ts` / `FundHistoryRows.tsx` と
 *    同じで、役割で名前を分けてある。
 *
 * ⚠️ **`react-native-svg` を足していない。** ネイティブモジュールなので
 *    **EAS の再ビルドが要る**（`docs/traps.md` の EAS）。既存のグラフと同じく
 *    素の View だけで描く。
 *
 * 描き方（0 度は 12 時、時計回り）:
 *   ① 右半分だけを見せる窓（`overflow: "hidden"`）を用意する
 *   ② その中に**左半円**を置き、`sweep` 度だけ回す
 *      → 回した分だけ右側にはみ出してきて、0〜sweep 度の扇に見える
 *   ③ 窓ごと `rotate` 度回して、扇を目的の位置へ持っていく
 *   ⚠️ この作りでは **180 度までしか描けない。** 超える分の分割は
 *      `pieChunks()` が済ませてある（描く側に分岐を持たせない）
 *
 * ⚠️ **回転の中心を合わせること。** 内側の半円は窓（幅は半径）の中で
 *    `left: -SIZE/2` に置いて、円の中心と一致させている。
 *    ずらすと扇が三日月になる。
 */

const SIZE = 132;
/**
 * ドーナツの穴。**中は空**（合計は円の下に出す）。
 * ⚠️ **広げないこと。** 広げるとドーナツの輪が細って、扇の色の差が読めなくなる。
 */
const HOLE = 78;

export function ExpenseCategoryPie({
  expenses,
  /** 円の下に出す合計。⚠️ 絞り込み後の合計を渡すこと（円と数字がずれる） */
  total,
}: {
  expenses: Expense[] | undefined;
  total: number;
}) {
  const slices = categorySlices(expenses);
  const chunks = pieChunks(slices);

  if (slices.length === 0) {
    return <Muted style={styles.empty}>この期間の経費はまだありません</Muted>;
  }

  return (
    <View style={styles.row}>
      <View style={styles.pieColumn}>
      <View style={styles.pie}>
        {chunks.map((chunk) => (
          <View
            key={chunk.key}
            // ③ 扇を目的の位置へ回す
            style={[styles.chunkFrame, { transform: [{ rotate: `${chunk.rotate}deg` }] }]}
            pointerEvents="none"
          >
            {/* ① 右半分だけを見せる窓 */}
            <View style={styles.window}>
              {/* ② 左半円を sweep 度回して、右側へはみ出させる */}
              <View
                style={[styles.halfWrap, { transform: [{ rotate: `${chunk.sweep}deg` }] }]}
              >
                <View style={[styles.half, { backgroundColor: chunk.color }]} />
              </View>
            </View>
          </View>
        ))}

          {/* 穴。⚠️ 影は付けない（丸くクリップした親の中なので iOS で消える） */}
          <View style={styles.hole} />
        </View>

        {/*
          ⚠️ **合計は円の中に入れない**（2026-08-06）。それまで穴（78px）に
             入れていたが、**桁が増えると `adjustsFontSizeToFit` が縮め続けて
             読めなくなっていた。** ¥1,000,000 を超えると顕著。
          ⚠️ **穴を広げて解決しない。** 広げるとドーナツの輪が細って
             扇の色の差が分からなくなる（12 カテゴリを色で見分ける図なので致命的）。
          ⚠️ **出すのはこの 1 か所だけ。** 見出しにも出すと同じ数字が
             数センチ離れて 2 回並ぶ。
        */}
        <View style={styles.totalBox}>
          <Muted style={styles.totalLabel}>合計</Muted>
          <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
            ¥{total.toLocaleString()}
          </Text>
        </View>
      </View>

      <View style={styles.legend}>
        {slices.map((slice) => (
          <LegendRow key={slice.category} slice={slice} />
        ))}
      </View>
    </View>
  );
}

function LegendRow({ slice }: { slice: CategorySlice }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.swatch, { backgroundColor: slice.color }]} />
      <Text style={styles.legendName} numberOfLines={1}>
        {slice.category}
      </Text>
      <Text style={styles.legendShare}>{slice.share}%</Text>
      <Text style={styles.legendValue}>¥{slice.total.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 12, textAlign: "center", paddingVertical: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  /* ⚠️ 円と合計を縦に積む列。`flexShrink: 0` を外すと、カテゴリ名が長いときに
        円のほうが潰れて扇が楕円になる */
  pieColumn: { alignItems: "center", flexShrink: 0 },

  pie: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    /* ⚠️ 円の外へはみ出した半円をここで切る。これが無いと四角いままになる */
    overflow: "hidden",
    backgroundColor: color.divider,
  },
  /* ⚠️ `StyleSheet.absoluteFillObject` は RN 0.86 で削除済み（docs/traps.md）。素で書く */
  chunkFrame: { position: "absolute", left: 0, top: 0, width: SIZE, height: SIZE },
  /** ① 右半分の窓 */
  window: {
    position: "absolute",
    left: SIZE / 2,
    top: 0,
    width: SIZE / 2,
    height: SIZE,
    overflow: "hidden",
  },
  /** ② 窓の中で回す入れ物。⚠️ 円の中心に合わせるため左へ半径ぶん寄せる */
  halfWrap: { position: "absolute", left: -SIZE / 2, top: 0, width: SIZE, height: SIZE },
  /** 左半円 */
  half: {
    position: "absolute",
    left: 0,
    top: 0,
    width: SIZE / 2,
    height: SIZE,
    borderTopLeftRadius: SIZE / 2,
    borderBottomLeftRadius: SIZE / 2,
  },

  hole: {
    position: "absolute",
    left: (SIZE - HOLE) / 2,
    top: (SIZE - HOLE) / 2,
    width: HOLE,
    height: HOLE,
    borderRadius: HOLE / 2,
    backgroundColor: color.cardBg,
  },

  /* ⚠️ 幅は円と同じ SIZE。金額はここいっぱいまで使える（穴の 78px の 1.7 倍） */
  totalBox: { width: SIZE, alignItems: "center", marginTop: spacing.sm },
  totalLabel: { fontSize: 10 },
  totalValue: { ...numeric, fontSize: 18, color: color.tealDeeper },

  legend: { flex: 1, gap: 3 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 22 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legendName: { flex: 1, fontFamily: font.ui, fontSize: 12, color: color.textMuted },
  /* ⚠️ 割合は幅を固定する。可変にすると行ごとに金額の左端がずれる */
  legendShare: {
    width: 40,
    fontFamily: font.ui,
    fontSize: 10,
    color: color.textFaint,
    textAlign: "right",
  },
  legendValue: { ...numeric, fontSize: 12, color: color.textMain },
});
