import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Platform } from "react-native";

/**
 * 横並びのカードを「指で払って 1 枚ずつ送る」ための処理。
 *
 * ── ScrollView をやめた理由 ──
 * もとは ScrollView に載せて、止まった位置から一番近いカードへ寄せ直していた。
 * これはブラウザ標準のスクロール（＝スライド）に乗っているだけで、
 * 指を払う操作とは別物だった。しかも react-native-web の ScrollView は
 * onScroll しか呼ばず（ScrollViewBase が DOM の scroll しか繋いでいない）、
 * onScrollBeginDrag / onScrollEndDrag / onMomentumScrollEnd も velocity も無いので、
 * 「どこから払い始めたか」「どれくらいの速さか」を取る手段が無い。
 *
 * そこで指の動きを PanResponder で直接取り、transform で動かす形にした。
 * PanResponder と Animated はどちらも RN のコアで react-native-web にも実装があるため、
 * ブラウザと実機で同じ経路になる。
 *
 * ⚠️ 縦スクロールを潰さないこと。ホームは縦の ScrollView の中なので、
 *    横の意思がはっきりした動き（|dx| > |dy| かつ SLOP 超え）のときだけ指を掴む。
 */

/** 隣へ送ると判断する移動量（カード幅に対する割合） */
const DISTANCE_RATIO = 0.25;

/**
 * フリックとみなす速度（ポイント / ミリ秒）。
 * ゆっくり少し動かしただけなら戻し、素早く払えば距離が短くても送る。
 */
const FLICK_VELOCITY = 0.3;

/** 縦スクロールに譲るためのしきい値。これ未満の横移動では反応しない */
const SLOP = 8;

/** 端でこれ以上は引っぱれない量。手応えを残しつつ引きちぎれないようにする */
const OVERDRAG = 48;

/** 端を越えたぶんの追従率。1 なら素通り、小さいほど重くなる */
const OVERDRAG_FRICTION = 0.35;

/** react-native-web の Animated はネイティブドライバを持たない */
const USE_NATIVE_DRIVER = Platform.OS !== "web";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type Options = {
  /** カードの枚数 */
  count: number;
  /** カード 1 枚ぶんの送り幅（カード幅 + 隙間）。0 のあいだは反応しない */
  interval: number;
  /** 左端に覗かせる幅。表示中のカードの左端をここに合わせる */
  peek: number;
};

export function useCardSwipe({ count, interval, peek }: Options) {
  const lastIndex = Math.max(0, count - 1);

  const [index, setIndex] = useState(lastIndex);
  /** PanResponder の中から読む現在位置。state だと古い値を掴む */
  const indexRef = useRef(lastIndex);
  const translateX = useRef(new Animated.Value(0)).current;

  /** カード i を表示位置に置くための移動量 */
  const restX = useCallback((i: number) => peek - i * interval, [peek, interval]);

  const settle = useCallback(
    (next: number, animated = true) => {
      indexRef.current = next;
      setIndex(next);
      const to = restX(next);
      if (!animated) {
        translateX.setValue(to);
        return;
      }
      Animated.spring(translateX, {
        toValue: to,
        useNativeDriver: USE_NATIVE_DRIVER,
        // 行き過ぎて戻る動きは目が疲れるので跳ねさせない
        bounciness: 0,
        speed: 14,
      }).start();
    },
    [restX, translateX]
  );

  /**
   * 幅が測れた時点と、データ到着で枚数が変わった時点で末尾（当月）に合わせる。
   * ⚠️ ここは必ずアニメーション無し。開いた瞬間に勝手に動くと操作と紛らわしい。
   */
  useEffect(() => {
    if (interval <= 0) return;
    settle(lastIndex, false);
  }, [interval, lastIndex, settle]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // タップは通す（カード内のボタンを潰さない）
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          interval > 0 &&
          lastIndex > 0 &&
          Math.abs(g.dx) > SLOP &&
          Math.abs(g.dx) > Math.abs(g.dy),
        // 掴んだあとは親の縦スクロールに渡さない
        onPanResponderTerminationRequest: () => false,

        onPanResponderMove: (_e, g) => {
          const max = restX(0);
          const min = restX(lastIndex);
          const raw = restX(indexRef.current) + g.dx;

          // 端を越えたぶんは重くする。まだ先があるように見えるのを防ぐ
          if (raw > max) {
            translateX.setValue(max + Math.min(OVERDRAG, (raw - max) * OVERDRAG_FRICTION));
          } else if (raw < min) {
            translateX.setValue(min - Math.min(OVERDRAG, (min - raw) * OVERDRAG_FRICTION));
          } else {
            translateX.setValue(raw);
          }
        },

        onPanResponderRelease: (_e, g) => {
          // 向きは移動量から取る。velocity の符号はプラットフォームで揃わないので大きさだけ見る
          const forward = g.dx < 0;
          const direction = g.dx === 0 ? 0 : forward ? 1 : -1;
          const moved =
            Math.abs(g.dx) > interval * DISTANCE_RATIO || Math.abs(g.vx) > FLICK_VELOCITY;
          const step = direction !== 0 && moved ? direction : 0;
          settle(clamp(indexRef.current + step, 0, lastIndex));
        },

        // 指が奪われた / 中断されたら元の位置へ戻す
        onPanResponderTerminate: () => settle(indexRef.current),
      }),
    [interval, lastIndex, restX, settle, translateX]
  );

  return {
    /** 今表示しているカード。ドットの追従に使う */
    index,
    /** Animated.View の transform に渡す */
    translateX,
    /** カードを載せる View に spread する */
    panHandlers: responder.panHandlers,
    /** ドットのタップなどから直接移動する */
    goTo: settle,
  };
}
