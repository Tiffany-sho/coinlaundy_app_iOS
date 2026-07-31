/**
 * 住所（`laundry_store.location`）から都道府県を切り出す。
 *
 * 店舗名にフリガナが無く、漢字の店名を `localeCompare` で並べても読み順にならない
 * （コードポイント順になる）ため、一覧の絞り込みは地域で行う。その材料。
 *
 * ⚠️ **住所は自由入力。** 都道府県から始まる保証は無く、郵便番号が前に付くことも
 *    市区町村から書かれることもある。取れなければ null を返して「その他」に寄せる。
 */

/** 47 都道府県。⚠️ 接尾辞（都・道・府・県）まで含めること（理由は prefectureOf） */
export const PREFECTURES = [
  "北海道",
  "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県",
  "沖縄県",
] as const;

export type Prefecture = (typeof PREFECTURES)[number];

/** 先頭の郵便番号（〒520-2304 / 5202304）と空白。住所の本体はその後ろから始まる */
const POSTAL_PREFIX = /^[\s〒]*\d{3}-?\d{4}[\s]*/;

/**
 * 住所から都道府県を取り出す。判定できなければ null。
 *
 * ⚠️ **接尾辞を落とした短い名前で `includes` しないこと。**
 *    「東京都」は「京都」を含むので、都を落とすと東京の店舗が京都に化ける。
 *
 * ⚠️ **接尾辞まで含めても `includes` だけでは足りない。**
 *    「東京都府中市」は **「京都府」を部分文字列として含む**（東-京-都-府-中-市 の 2〜4 文字目）。
 *    実在する市名なので、いつか必ず踏む。したがって
 *      1. まず郵便番号を落とした先頭との一致（`startsWith`）を見る ← 実データはほぼこれ
 *      2. それでも決まらなければ**最も手前に現れたもの**を採る
 *    の順で判定する。「東京都府中市」は 1 で決まり、仮に 2 に落ちても
 *    「東京都」が index 0、「京都府」が index 1 なので東京都が勝つ。
 */
export function prefectureOf(location: string | null | undefined): Prefecture | null {
  if (!location) return null;
  const body = location.trim().replace(POSTAL_PREFIX, "");
  if (body === "") return null;

  for (const pref of PREFECTURES) {
    if (body.startsWith(pref)) return pref;
  }

  let best: Prefecture | null = null;
  let bestAt = Infinity;
  for (const pref of PREFECTURES) {
    const at = body.indexOf(pref);
    // 同じ位置で始まることは無いので、位置だけで一意に決まる
    if (at !== -1 && at < bestAt) {
      best = pref;
      bestAt = at;
    }
  }
  return best;
}

/** 「その他」（都道府県を判定できなかった店舗）を表す値。⚠️ 実在の都道府県名と衝突しない */
export const UNKNOWN_REGION = "__unknown__";

export type RegionOption = { value: string; label: string; count: number };

/**
 * 一覧に出す地域の選択肢を、店舗数の多い順に組み立てる。
 *
 * ⚠️ 並びは PREFECTURES の順ではなく**店舗数の多い順**。よく使う地域が
 *    先頭 3 つ（＝たたまずに見えるタブ）に来るようにするため。
 *    同数のときは PREFECTURES の順（＝北から南）で安定させる。
 *
 * ⚠️ 「その他」は件数に関わらず必ず末尾。判定に失敗した寄せ集めなので、
 *    件数が多いというだけで先頭のタブを占めると使いにくい。
 */
export function buildRegionOptions(
  stores: readonly { location: string | null }[]
): RegionOption[] {
  const counts = new Map<string, number>();
  for (const store of stores) {
    const key = prefectureOf(store.location) ?? UNKNOWN_REGION;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const order = new Map<string, number>(PREFECTURES.map((pref, i) => [pref, i]));

  return [...counts.entries()]
    .map(([value, count]) => ({
      value,
      label: value === UNKNOWN_REGION ? "その他" : value,
      count,
    }))
    .sort((a, b) => {
      if (a.value === UNKNOWN_REGION) return 1;
      if (b.value === UNKNOWN_REGION) return -1;
      if (a.count !== b.count) return b.count - a.count;
      return (order.get(a.value) ?? 0) - (order.get(b.value) ?? 0);
    });
}
