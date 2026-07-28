import { useCallback, useRef, useState } from "react";
import {
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from "react-native";

/**
 * 横並びのカードを「1 回のフリックで 1 枚だけ」送るための ScrollView 用フック。
 *
 * ⚠️ react-native-web の ScrollView は onScroll しか呼ばない。
 *    ScrollViewBase が DOM の scroll イベントだけを繋いでいて、
 *    onScrollBeginDrag / onScrollEndDrag / onMomentumScrollEnd は**一度も発火しない**。
 *    normalizeScrollEvent が組む event にも velocity が無い。
 *    そのため送り先の決め方をプラットフォームで分けている。
 *
 *      ネイティブ … onScrollBeginDrag で開始位置を控え、onScrollEndDrag の
 *                   移動量と velocity で送り先を決める
 *      Web       … スクロールが WEB_IDLE_MS 止まったのを onScroll で見て、
 *                   そこから送り先を決める（RNW も内部で 100ms の
 *                   scrollend タイマーを持っていて最後の onScroll を必ず 1 回出す）
 *
 * どちらも**送り先を「指を置いた時のカード ±1」に丸める**のが肝。
 * 「一番近いカードへ寄せる」だけだと、勢いをつけたときに数枚飛んだ先へ吸着してしまう。
 */

/** 送り先を隣へ移すと判断する移動量（カード幅に対する割合） */
const DISTANCE_RATIO = 0.25;

/**
 * フリックとみなす速度（ポイント / ミリ秒）。
 * ⚠️ velocity.x の符号は iOS と Android で向きが揃わないので、向きは移動量から取り、
 *    velocity は大きさだけを見る。
 */
const FLICK_VELOCITY = 0.3;

/** Web でスクロールが止まったとみなすまでの時間 */
const WEB_IDLE_MS = 140;

const isWeb = Platform.OS === "web";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type Options = {
  /** カード 1 枚ぶんの送り幅（カード幅 + 隙間）。0 のときは何もしない */
  interval: number;
  lastIndex: number;
  scrollRef: React.RefObject<ScrollView | null>;
};

export function useCardPaging({ interval, lastIndex, scrollRef }: Options) {
  /** ドットの表示に使う、今出ているカード */
  const [index, setIndex] = useState(lastIndex);

  /** 指を置いた時点で止まっていたカード。送り先はここから ±1 に丸める */
  const restIndex = useRef(lastIndex);
  /** ネイティブでドラッグを始めた位置。移動量の向きを出すのに使う */
  const dragStartX = useRef(0);
  /** Web の「止まった」判定タイマー */
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * これ以上スクロールできない位置。
   * 寄せ先をここで頭打ちにしないと、届かない座標へ scrollTo → clamp された
   * scroll イベント → また scrollTo、と無限に往復することがある。
   */
  function maxOffset(e: NativeSyntheticEvent<NativeScrollEvent>): number {
    const { contentSize, layoutMeasurement } = e.nativeEvent;
    return Math.max(0, contentSize.width - layoutMeasurement.width);
  }

  /** 送り先へ寄せる。既にそこに居るなら何もしない（往復防止） */
  const settle = useCallback(
    (target: number, currentX: number, maxX: number) => {
      restIndex.current = target;
      setIndex(target);
      const x = Math.min(target * interval, maxX);
      if (Math.abs(currentX - x) > 1) scrollRef.current?.scrollTo({ x, animated: true });
    },
    [interval, scrollRef]
  );

  /** 移動量と速度から送り先を出す。開始位置から動くのは最大 1 枚 */
  const nextIndex = useCallback(
    (deltaX: number, velocity: number) => {
      const direction = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
      const moved =
        Math.abs(deltaX) > interval * DISTANCE_RATIO || Math.abs(velocity) > FLICK_VELOCITY;
      const step = direction !== 0 && moved ? direction : 0;
      return clamp(restIndex.current + step, 0, lastIndex);
    },
    [interval, lastIndex]
  );

  /** 幅が決まった / 月が増えたときに位置を合わせ直す側から呼ぶ */
  const resetTo = useCallback((next: number) => {
    restIndex.current = next;
    setIndex(next);
  }, []);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (interval <= 0) return;
    const x = e.nativeEvent.contentOffset.x;

    // 指の動きにドットを追従させる（送り先が確定するまでの見た目）
    const shown = clamp(Math.round(x / interval), 0, lastIndex);
    setIndex((prev) => (prev === shown ? prev : shown));

    if (!isWeb) return;

    const maxX = maxOffset(e);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      // Web は velocity が取れないので移動量だけで向きを決める
      settle(nextIndex(x - restIndex.current * interval, 0), x, maxX);
    }, WEB_IDLE_MS);
  }

  function onScrollBeginDrag(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (isWeb || interval <= 0) return;
    const x = e.nativeEvent.contentOffset.x;
    dragStartX.current = x;
    restIndex.current = clamp(Math.round(x / interval), 0, lastIndex);
  }

  function onScrollEndDrag(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (isWeb || interval <= 0) return;
    const x = e.nativeEvent.contentOffset.x;
    settle(nextIndex(x - dragStartX.current, e.nativeEvent.velocity?.x ?? 0), x, maxOffset(e));
  }

  /**
   * Android は disableIntervalMomentum（iOS 専用）が効かず、
   * onScrollEndDrag の scrollTo のあとにも慣性が残ることがあるので押さえ直す。
   */
  function onMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (isWeb || interval <= 0) return;
    settle(restIndex.current, e.nativeEvent.contentOffset.x, maxOffset(e));
  }

  /** 画面から外れるときにタイマーを止める側から呼ぶ */
  const cancelPending = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  return {
    index,
    resetTo,
    cancelPending,
    handlers: { onScroll, onScrollBeginDrag, onScrollEndDrag, onMomentumScrollEnd },
  };
}
