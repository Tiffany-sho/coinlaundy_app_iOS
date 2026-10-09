import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { color } from "@/theme/tokens";

/**
 * 3 面の横ページャ。**前の期間 / 今の期間 / 次の期間**を横に並べ、指で払って送る。
 *
 * ⚠️ **`ScrollView` で作らないこと。** react-native-web の ScrollView は
 *    `onScrollEndDrag` も `onMomentumScrollEnd` も呼ばず `velocity` も持たないので、
 *    「どれくらいの速さで払ったか」が取れない（`docs/traps.md` の react-native-web）。
 *    しきい値と速度は `useCardSwipe`（ホームの月別カード）と同じ値に揃えてある。
 *
 * ⚠️ **中身の入れ替えは親が行う。** このコンポーネントは「送りたい」と伝えるだけで、
 *    期間そのものは持たない。親が期間をずらすと `pageKey` が変わり、位置が 0 に戻る。
 */
export function ChartPager({
  pageKey,
  canPrev,
  canNext,
  onPage,
  prev,
  current,
  next,
}: {
  /** 今の期間を表す文字列。**変わったら位置を戻す**ので、期間ごとに一意にすること */
  pageKey: string;
  /** 過去へ送れるか。false のときは端の手応えだけ返して送らない */
  canPrev: boolean;
  canNext: boolean;
  /** -1 = 過去へ / 1 = 未来へ。呼ばれたら親が期間をずらす */
  onPage: (direction: -1 | 1) => void;
  prev: React.ReactNode;
  current: React.ReactNode;
  next: React.ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  /** 送りの最中。⚠️ 二重に掴むと位置が飛ぶ */
  const animating = useRef(false);

  /**
   * 期間が変わったら位置を戻す。
   *
   * ⚠️ **`useLayoutEffect` であること。** `useEffect` は描画のあとに走るので、
   *    確定した瞬間に**隣の期間が 1 フレーム見える。**
   */
  useLayoutEffect(() => {
    translateX.setValue(0);
    animating.current = false;
  }, [pageKey, translateX]);

  const settle = useCallback(
    (dx: number, vx: number) => {
      if (width <= 0) {
        translateX.setValue(0);
        return;
      }
      const toPast = dx > 0; // 右へ引く＝左にある「前の期間」を引き寄せる
      const allowed = toPast ? canPrev : canNext;
      const moved = Math.abs(dx) > width * DISTANCE_RATIO || Math.abs(vx) > FLICK_VELOCITY;
      const go = dx !== 0 && allowed && moved;

      animating.current = true;
      Animated.timing(translateX, {
        toValue: go ? (toPast ? width : -width) : 0,
        duration: SETTLE_MS,
        /*
          ⚠️ **ネイティブドライバを使わない。** 指で引いている間は
             PanResponder → setValue の JS 経路なので速度差はほとんど無い。
             JS 側に留めておくと「期間の確定」と「位置の戻し」が同じ tick で反映され、
             隣の期間が一瞬見えるのを防げる。
        */
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) return;
        if (!go) {
          animating.current = false;
          return;
        }
        Haptics.selectionAsync().catch(() => {});
        // 親が期間をずらす → pageKey が変わって上の layout effect が 0 に戻す
        onPage(toPast ? -1 : 1);
      });
    },
    [width, canPrev, canNext, onPage, translateX]
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        /* ⚠️ タップは通す。棒を押して内訳を見る操作を潰さない */
        onStartShouldSetPanResponder: () => false,
        /* ⚠️ 縦スクロールに譲る。横の意思がはっきりしたときだけ掴む
              （このカードは縦に流れる一覧の中にある） */
        onMoveShouldSetPanResponder: (_e, g) =>
          width > 0 &&
          !animating.current &&
          Math.abs(g.dx) > SLOP &&
          Math.abs(g.dx) > Math.abs(g.dy),
        // 掴んだあとは親の縦スクロールに渡さない
        onPanResponderTerminationRequest: () => false,

        onPanResponderMove: (_e, g) => {
          const blocked = g.dx > 0 ? !canPrev : !canNext;
          if (!blocked) {
            translateX.setValue(g.dx);
            return;
          }
          // 端を越えたぶんは重くする。まだ先があるように見えるのを防ぐ
          const sign = g.dx > 0 ? 1 : -1;
          translateX.setValue(sign * Math.min(EDGE_MAX, Math.abs(g.dx) * EDGE_FRICTION));
        },

        onPanResponderRelease: (_e, g) => settle(g.dx, g.vx),
        // 指が奪われた／中断されたら元の位置へ戻す
        onPanResponderTerminate: () => settle(0, 0),
      }),
    [width, canPrev, canNext, settle, translateX]
  );

  function onLayout(e: LayoutChangeEvent) {
    const next = Math.round(e.nativeEvent.layout.width);
    setWidth((prevWidth) => (prevWidth === next ? prevWidth : next));
  }

  return (
    <View style={styles.viewport} onLayout={onLayout}>
      {width > 0 && (
        <Animated.View
          /* ⚠️ 定位置のずらしは marginLeft（レイアウト）で、指の追従は transform で行う。
                両方を Animated.add で合成すると毎レンダー新しい値ができて繋がらない */
          style={[
            styles.strip,
            { width: width * 3, marginLeft: -width, transform: [{ translateX }] },
          ]}
          {...responder.panHandlers}
        >
          <View style={{ width }}>{prev}</View>
          <View style={{ width }}>{current}</View>
          <View style={{ width }}>{next}</View>
        </Animated.View>
      )}
    </View>
  );
}

/**
 * 期間を送る矢印。**払う操作と必ず併設する。**
 *
 * ⚠️ ジェスチャだけにすると気づかれないうえ、**VoiceOver から操作できない。**
 * ⚠️ 端では押せなくする（押しても動かないボタンを残さない）。
 */
export function PagerArrow({
  direction,
  disabled,
  onPress,
}: {
  direction: -1 | 1;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={direction === -1 ? "前の期間" : "次の期間"}
      accessibilityState={{ disabled }}
      hitSlop={10}
      style={({ pressed }) => [
        styles.arrow,
        disabled && { opacity: 0.25 },
        pressed && !disabled && { opacity: 0.6 },
      ]}
    >
      <Ionicons
        name={direction === -1 ? "chevron-back" : "chevron-forward"}
        size={20}
        color={color.tealDeeper}
      />
    </Pressable>
  );
}

/** 隣へ送ると判断する移動量（幅に対する割合）。⚠️ useCardSwipe と同じ値に揃えてある */
const DISTANCE_RATIO = 0.25;

/** フリックとみなす速度（ポイント / ミリ秒） */
const FLICK_VELOCITY = 0.3;

/** 縦スクロールに譲るためのしきい値。これ未満の横移動では反応しない */
const SLOP = 8;

/** 端でこれ以上は引っぱれない量 */
const EDGE_MAX = 56;

/** 端を越えたぶんの追従率。小さいほど重くなる */
const EDGE_FRICTION = 0.3;

/** 送りきるまで。長くすると指を離してからの待ちが目立つ */
const SETTLE_MS = 220;

const styles = StyleSheet.create({
  /* ⚠️ 幅を決めておく。中身で決めると期間の文字数でボタンの位置が動く */
  arrow: { width: 28, alignItems: "center", justifyContent: "center" },
  /* ⚠️ はみ出した隣の期間を隠す。ここを外すとカードの外に前後の期間が描かれる */
  viewport: { overflow: "hidden" },
  strip: { flexDirection: "row" },
});
