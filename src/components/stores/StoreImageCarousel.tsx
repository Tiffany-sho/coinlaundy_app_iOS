import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { color, radius, shadow, spacing } from "@/theme/tokens";
import type { StoreImage } from "@/api/types";

/** 自動で次の写真へ送るまでの間隔 */
const INTERVAL_MS = 4000;

/**
 * 店舗詳細の画像カルーセル。自動で送り、指でも送れる。
 *
 * ⚠️ **`ScrollView` + `pagingEnabled` で作ってある。** `docs/traps.md` に
 *    「カルーセルを ScrollView で作らない」と書いてあるのは**ホームの月別カード**の話で、
 *    あちらは「どこから払い始めたか」「どれくらいの速さか」を見て 1 枚ずつ送る判定が
 *    必要だった（web では `onScrollBeginDrag` も `velocity` も取れないので
 *    `PanResponder` を自作した）。ここは 1 画面 1 枚に吸着させるだけで判定が要らず、
 *    `pagingEnabled` は CSS scroll-snap に落ちて web でも効く。
 *
 * ⚠️ **`onScrollEndDrag` / `onMomentumScrollEnd` に依存していない。** web では
 *    一度も発火しないため。現在位置は `onScroll` だけで決めている（これは両方で動く）。
 *
 * ⚠️ **自動送りのタイマーは `index` を依存に持たせてある。** これで指で送ったときも
 *    タイマーが張り直され、「触った直後に勝手に飛ぶ」が起きない。
 *    ドラッグ開始のイベントを使わずに済むのでプラットフォーム差が出ない。
 */
export function StoreImageCarousel({
  images,
  width,
  fallbackUrl,
  children,
}: {
  images: StoreImage[];
  /** 1 枚の幅。呼び出し側が画面幅から左右のパディングを引いて渡す */
  width: number;
  /** 画像が 0 枚のときに出す画像 */
  fallbackUrl: string;
  /** 画像の上に重ねるもの（戻る / メニュー）。位置は呼び出し側が決める */
  children?: React.ReactNode;
}) {
  const shown = images.length > 0 ? images : [{ url: fallbackUrl, path: "" }];
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (shown.length <= 1) return;
    const timer = setTimeout(() => {
      const next = (index + 1) % shown.length;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
    }, INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [index, shown.length, width]);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // ⚠️ width が 0 のとき（初回レイアウト前）に割ると Infinity になる
    if (width <= 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index && next >= 0 && next < shown.length) setIndex(next);
  }

  return (
    <View style={[styles.frame, { width }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.track}
      >
        {shown.map((img, i) => (
          <Image
            key={`${img.url}-${i}`}
            source={{ uri: img.url }}
            style={{ width, aspectRatio: 16 / 9 }}
            contentFit="cover"
            transition={150}
          />
        ))}
      </ScrollView>

      {children}

      {/* 1 枚しか無いときに点を出すと「他にもある」と誤解させるので出さない */}
      {shown.length > 1 && (
        <View style={styles.dots}>
          {shown.map((img, i) => (
            <Pressable
              key={`dot-${img.url}-${i}`}
              onPress={() => {
                scrollRef.current?.scrollTo({ x: i * width, animated: true });
                setIndex(i);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}枚目を表示`}
            >
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * 影はここ。角丸のクリップは中の ScrollView 側でやる。
   *
   * ⚠️ **`overflow: "hidden"` と影を同じ View に置かないこと。** iOS は影を
   *    ビューの**外側**に描くので、同じ View でクリップすると影が丸ごと消える。
   *    影を出す側には `backgroundColor` も必要（透明だと影の形が決まらない）。
   */
  frame: {
    borderRadius: radius.card,
    backgroundColor: color.cardBg,
    ...shadow.sm,
  },
  track: {
    borderRadius: radius.card,
    // ⚠️ これが無いと角丸の外に中の Image がはみ出す
    overflow: "hidden",
  },
  dots: {
    position: "absolute",
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  dotActive: { backgroundColor: color.cardBg, width: 18 },
});
