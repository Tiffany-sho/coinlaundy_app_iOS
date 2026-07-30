import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStatusBarStyle } from "@/components/common/useStatusBarStyle";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * 未ログイン画面。Netflix の未ログイン画面の構成を下敷きにしている。
 *   全面ビジュアル → ヘッドライン → チェックリスト → ページドット → 下部 CTA
 *
 * ⚠️ Netflix は下部に「アカウントの作成は netflix.com/more から」と出しているが、
 *    あれは Apple の External Link Account entitlement を取得している場合にだけ許される。
 *    このアプリは entitlement を持たないので同じことはできない。
 *    アプリ内の新規登録（/signup）へ送ること。
 *
 * ⚠️ Web のランディング（TopPop.jsx）には
 *    「Proプランは6か月無料」「3店舗まで永久無料」というバッジがあるが、
 *    プラン・価格への言及は App Store Guideline 3.1.3(a) のリジェクト事由になるため
 *    この画面には持ち込まない。文言を足すときも同じ理由で価格に触れないこと。
 */

type Slide = {
  headline: string[];
  points: string[];
};

const SLIDES: Slide[] = [
  {
    headline: ["集金ノートを、", "卒業しませんか。"],
    points: [
      "機種ごとの枚数を入力するだけで自動集計",
      "電波が届かない店内でもそのまま入力",
      "誰がいつ集金したかが記録に残る",
    ],
  },
  {
    headline: ["在庫も機器の状態も、", "ひとつの画面で。"],
    points: [
      "洗剤・柔軟剤の残量をその場で更新",
      "故障中の機器がひと目で分かる",
      "対応が必要な店舗をホームに表示",
    ],
  },
  {
    headline: ["売上は、", "自動でグラフになります。"],
    points: [
      "月別・店舗別の売上を自動で集計",
      "前月比・前年同月比をその場で確認",
      "過去の集金履歴をいつでも見返せる",
    ],
  },
];

/**
 * 文字の背後に敷くコラージュ画像。
 *
 * ⚠️ assets/welcome/*.png は差し替え前提のプレースホルダ（単色グラデーションのモック）。
 *    実際のアプリのスクリーンショットを同じファイル名で上書きすれば、このファイルは触らなくてよい。
 *    縦長（3:4 程度）で書き出すこと。contentFit="cover" なので多少比率がずれても破綻しない。
 */
const COLLAGE_TILES = [
  require("../assets/welcome/tile-01-home.png"), // ホーム
  require("../assets/welcome/tile-02-collect.png"), // 集金入力
  require("../assets/welcome/tile-03-revenue.png"), // 売上グラフ
  require("../assets/welcome/tile-04-stores.png"), // 店舗一覧
  require("../assets/welcome/tile-05-inventory.png"), // 在庫
  require("../assets/welcome/tile-06-history.png"), // 集金履歴
];

/** 3 列 x 5 段。列ごとに開始位置をずらして、同じ画像が横に並ばないようにする */
const COLLAGE_COLUMNS = [0, 1, 2].map((col) =>
  Array.from({ length: 5 }, (_, row) => COLLAGE_TILES[(col * 2 + row) % COLLAGE_TILES.length]),
);

/** 列ごとの縦ずらし量（タイル高さに対する比）。段が横一直線に揃うと格子に見えるので崩す */
const COLLAGE_COLUMN_SHIFT = [0, -0.42, 0.24];

/** コラージュを画面端から離す量。0 にすると全面敷き詰めになる */
const COLLAGE_PADDING = spacing.lg;
const COLLAGE_GAP = 10;

/**
 * StyleSheet.absoluteFill を style に渡すのは今まで通り使えるが、
 * 他のプロパティと混ぜたいときに展開する用。
 * RN 0.86 の型から absoluteFillObject が消えたので自前で持っている。
 */
const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

export default function Welcome() {
  /**
   * 背景が濃色なのでステータスバーだけ白抜きにする。
   * ⚠️ `<StatusBar style="light" />` を置かないこと。あれは離れても元に戻らないので、
   *    この画面を通ったあと薄い水色の背景に白文字が残って時計も電池も読めなくなる
   *    （`useStatusBarStyle` のコメント参照）。
   */
  useStatusBarStyle("light");

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // コラージュのタイル寸法。列幅は画面幅から padding と列間 gap を引いて 3 等分する
  const tileWidth = (width - COLLAGE_PADDING * 2 - COLLAGE_GAP * 2) / 3;
  const tileHeight = Math.round(tileWidth * 1.38);

  /**
   * ページドットの追従。
   * ⚠️ onMomentumScrollEnd は react-native-web では発火しない（Web ビルドでドットが
   *    動かなくなる）。onScroll + scrollEventThrottle で毎フレーム算出すれば、
   *    慣性スクロールのある実機でも Web でも同じ計算で動く。
   */
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0) return; // 初回レイアウト前は 0 が来る。0 除算で NaN になるのを避ける
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    const next = Math.min(Math.max(page, 0), SLIDES.length - 1); // 端のバウンスで範囲外に出る
    setIndex((prev) => (prev === next ? prev : next));
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#155E75", "#0891B2", "#06B6D4"]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* 装飾円。Web のランディング（TopPop.jsx）と同じ位置・同じ濃さ */}
      <View style={styles.circleTop} pointerEvents="none" />
      <View style={styles.circleBottom} pointerEvents="none" />

      {/*
        文字の背後のコラージュ。Netflix と違って全面には敷かず、画面端から
        COLLAGE_PADDING だけ内側に入れて角を丸める（枠付きの写真に見せる）。
      */}
      <View style={styles.collageFrame} pointerEvents="none">
        <View style={styles.collageClip}>
          <View style={styles.collageGrid}>
            {COLLAGE_COLUMNS.map((column, col) => (
              <View
                key={col}
                style={[
                  styles.collageColumn,
                  { transform: [{ translateY: tileHeight * COLLAGE_COLUMN_SHIFT[col]! }] },
                ]}
              >
                {column.map((tile, row) => (
                  <Image
                    key={`${col}-${row}`}
                    source={tile}
                    style={[styles.collageTile, { height: tileHeight }]}
                    contentFit="cover"
                  />
                ))}
              </View>
            ))}
          </View>
          {/*
            ⚠️ 画像の上のスクリム。これを薄くすると白文字が読めなくなる。
               grid の opacity 0.45 と合わせて、最悪ケース（真っ白な写真を置いた場合）でも
               白文字とのコントラストが 5:1 以上になるよう決めた値なので、勝手に下げないこと。
          */}
          <View style={styles.collageScrim} />
        </View>
      </View>

      {/* 下に向かって暗くして、文字とボタンのコントラストを確保する */}
      <LinearGradient
        colors={["transparent", "rgba(8,47,73,0.55)", "rgba(8,47,73,0.92)"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.logo}>Collecie</Text>
        <Pressable
          onPress={() => router.push("/login")}
          style={({ pressed }) => [styles.loginButton, pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.loginLabel}>ログイン</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide) => (
          <View key={slide.headline.join("")} style={[styles.slide, { width }]}>
            <View style={styles.headlineBlock}>
              {slide.headline.map((line) => (
                <Text key={line} style={styles.headline}>
                  {line}
                </Text>
              ))}
            </View>

            <View style={styles.points}>
              {slide.points.map((point) => (
                <View key={point} style={styles.pointRow}>
                  <Ionicons name="checkmark" size={20} color={color.cyan300} />
                  <Text style={styles.pointText}>{point}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((slide, i) => (
          <Pressable
            key={slide.headline.join("")}
            onPress={() => {
              scrollRef.current?.scrollTo({ x: i * width, animated: true });
              setIndex(i);
            }}
            hitSlop={10}
          >
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </Pressable>
        ))}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Pressable
          onPress={() => router.push("/signup")}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.ctaLabel}>アカウントを作成</Text>
        </Pressable>
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>既にアカウントをお持ちの方は </Text>
          <Pressable onPress={() => router.push("/login")} hitSlop={8}>
            <Text style={styles.footerLink}>ログイン</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.tealDeeper },
  circleTop: {
    position: "absolute",
    top: -140,
    right: -140,
    width: 420,
    height: 420,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  circleBottom: {
    position: "absolute",
    bottom: 40,
    left: -110,
    width: 300,
    height: 300,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  // --- 背後のコラージュ ---
  collageFrame: { ...StyleSheet.absoluteFill, padding: COLLAGE_PADDING },
  collageClip: {
    flex: 1,
    // 角丸は tokens に無いサイズ（radius.card=18 だと画面サイズに対して small すぎる）
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "rgba(8,47,73,0.35)", // 画像の読み込み前に見える下地
  },
  collageGrid: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    gap: COLLAGE_GAP,
    opacity: 0.45,
    // 少し傾けて敷き詰める。傾けると角に隙間ができるので拡大して覆う
    transform: [{ rotate: "-8deg" }, { scale: 1.35 }],
  },
  collageColumn: { flex: 1, gap: COLLAGE_GAP, justifyContent: "center" },
  collageTile: {
    flexShrink: 0, // 枚数が親の高さを超えても縮めない（はみ出した分は clip 側で切る）
    borderRadius: radius.card,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  collageScrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(8,47,73,0.55)" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  logo: {
    fontFamily: font.uiBold,
    fontSize: 24,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  loginButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  loginLabel: { fontFamily: font.uiBold, fontSize: 14, color: "#FFFFFF" },

  slide: { justifyContent: "center", paddingHorizontal: spacing.xl },
  headlineBlock: { marginBottom: spacing.xxl },
  headline: {
    fontFamily: font.uiBold,
    fontSize: 30,
    lineHeight: 44,
    color: "#FFFFFF",
    textAlign: "center",
  },
  points: { gap: spacing.lg },
  pointRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  pointText: {
    fontFamily: font.ui,
    fontSize: 15,
    lineHeight: 24,
    color: "rgba(255,255,255,0.88)",
    flex: 1,
  },

  dots: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotActive: { backgroundColor: "#FFFFFF" },

  footer: { paddingHorizontal: spacing.xl, gap: spacing.md },
  cta: {
    minHeight: HIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ctaLabel: { fontFamily: font.uiBold, fontSize: 16, color: color.tealDeeper },
  footerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontFamily: font.ui, fontSize: 13, color: "rgba(255,255,255,0.75)" },
  footerLink: { fontFamily: font.uiBold, fontSize: 13, color: "#FFFFFF" },
});
