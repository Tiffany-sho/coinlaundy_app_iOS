/**
 * Web の globals.css にある CSS 変数を 1:1 で移したもの。
 * 色を足したくなったら先に Web 側を確認し、両方を同時に更新すること。
 */

export const color = {
  teal: "#0891B2", // プライマリ
  tealDark: "#0E7490", // ホバー・アクティブ
  tealDeeper: "#155E75", // ロゴ・見出し
  tealPale: "#CFFAFE", // 薄い背景
  appBg: "#F0F9FF", // 画面背景
  cardBg: "#FFFFFF",
  textMain: "#1E3A5F",
  textMuted: "#64748B",
  textFaint: "#94A3B8",
  divider: "#F1F5F9",
  /**
   * 真っ白な画面の上で「枠」として見える最も薄い線（slate.200）。Web も 4 箇所で使っている。
   * ⚠️ `divider`（#F1F5F9）は**白の上に置くと 1.07:1 で見えない。** カードの中の
   *    区切り線専用。白地に直接置くフォームの枠にはこちらを使うこと。
   */
  border: "#E2E8F0",

  // Web が Chakra / Tailwind のパレットで使っている色。値を合わせてある
  cyan50: "#ECFEFF", // 選択中のラジオカード背景
  cyan100: "#CFFAFE", // カード枠線
  cyan200: "#A5F3FC",
  cyan300: "#67E8F9",
  cyan400: "#22D3EE", // 入力フォーカス枠
  cyan700: "#0E7490",
  cyan800: "#155E75",
  cyan900: "#164E63", // 選択中のラジオカード見出し
  teal100: "#CCFBF1",
  teal800: "#115E59",
  orange100: "#FFEDD5",
  orange200: "#FED7AA",
  orange300: "#FDBA74",
  orange500: "#F97316", // 要対応・警告
  red50: "#FEF2F2",
  red400: "#F87171",
  red500: "#EF4444", // 故障・日曜
  blue500: "#3B82F6", // 土曜
  // 保留中の招待カード（Web の yellow.50 / yellow.200 / yellow.800）
  yellow50: "#FEFCE8",
  yellow200: "#FEF08A",
  yellow800: "#854D0E",
  gray50: "#F9FAFB",
  gray100: "#F3F4F6",
  gray500: "#6B7280",
  gray600: "#4B5563",
  gray700: "#374151",
  gray800: "#1F2937",

  danger: "#EF4444",
  warning: "#F97316",
  success: "#059669",
} as const;

/** 店舗別グラフの配色。Web の StoreRevenueChart.jsx と同じパレット */
export const STORE_COLORS = [
  "#93C5FD",
  "#6EE7B7",
  "#FCD34D",
  "#FCA5A5",
  "#C4B5FD",
  "#67E8F9",
  "#FDBA74",
  "#F9A8D4",
  "#BEF264",
  "#A5B4FC",
] as const;

/**
 * ヒーローカードは月ごとに配色が変わる（Web の SalesCardClient.jsx と同じ）。
 * linear-gradient(140deg, A 0%, B 55%, C 100%) の 3 色。
 */
export const MONTH_GRADIENT: Record<number, [string, string, string]> = {
  1: ["#1e3a5f", "#2563eb", "#3b82f6"],
  2: ["#6b21a8", "#9333ea", "#c084fc"],
  3: ["#be185d", "#ec4899", "#f9a8d4"],
  4: ["#be123c", "#f43f5e", "#fb7185"],
  5: ["#15803d", "#22c55e", "#4ade80"],
  6: ["#0f766e", "#14b8a6", "#5eead4"],
  7: ["#0e7490", "#0891b2", "#22d3ee"],
  8: ["#c2410c", "#ea580c", "#fb923c"],
  9: ["#b45309", "#d97706", "#fbbf24"],
  10: ["#9a3412", "#c2410c", "#ea580c"],
  11: ["#7f1d1d", "#b91c1c", "#ef4444"],
  12: ["#1e3a8a", "#2563eb", "#60a5fa"],
};

/** Chakra の radii に対応させる（md=8, lg=12, xl=16, 2xl=18 相当を card として使う） */
export const radius = { md: 8, lg: 12, xl: 16, card: 18, pill: 999 } as const;

export const shadow = {
  sm: {
    shadowColor: "#0891B2",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  hero: {
    shadowColor: "#0E7490",
    shadowOpacity: 0.28,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

export const font = {
  ui: "NotoSansJP_400Regular",
  uiBold: "NotoSansJP_700Bold",
  num: "Inter_700Bold", // 金額・数値表示
} as const;

/**
 * 金額・数値の書体。`fontFamily` だけでなく**これを丸ごと展開して使う**こと。
 *
 * ⚠️ Inter は等幅ではないので `fontVariant` を落とすと桁ごとに字幅が変わり、
 *    金額を縦に並べたとき右端が揃わなくなる（1 と 8 で幅が違う）。
 *    tabular-nums を付けると全数字が同じ幅になり、等幅と同じ見え方になる。
 * ⚠️ Web 側は今も 'Space Mono'。アプリだけ Inter にしてあるので、
 *    Web と同じ数字に見せる必要が出たときは両方を同時に変えること。
 */
export const numeric = {
  fontFamily: font.num,
  // ⚠️ 配列ごと as const にしない。RN の型は FontVariant[]（可変）なので
  //    readonly タプルだと StyleSheet.create の推論が TextStyle から外れて全滅する
  fontVariant: ["tabular-nums" as const],
};

/** ヒーローカード: linear-gradient(140deg, #0E7490, #0891B2 55%, #06B6D4) */
export const heroGradient = {
  colors: ["#0E7490", "#0891B2", "#06B6D4"] as [string, string, string],
  locations: [0, 0.55, 1] as [number, number, number],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

/**
 * 主ボタンのグラデーション: linear-gradient(135deg, #0891B2 0%, #0E7490 100%)。
 * Web は「次へ」「登録」「参加する」などの主ボタンを必ずこの 2 色で塗っている。
 * 単色 teal で塗ると本家と違って見えるので、主ボタンは gradient variant を使うこと。
 */
export const buttonGradient = {
  colors: ["#0891B2", "#0E7490"] as [string, string],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * タップ領域。iOS HIG は 44pt 以上だが、現場のグローブ操作を優先して 48pt を維持する
 * （Web 側の 48x48px と揃える）。
 */
export const HIT_SIZE = 48;
