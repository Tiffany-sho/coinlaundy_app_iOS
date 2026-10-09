import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * 初描画のときに下からふわりと現れる箱。カード・セクションを包んで使う。
 *
 * ```tsx
 * <Appear index={0} style={{ marginTop: spacing.xl }}>
 *   <ListCard …>
 * </Appear>
 * ```
 *
 * ⚠️ **マウント時に 1 回だけ動く。** タブの画面はタブを切り替えても unmount されない
 *    ので、戻ってきても再生されない（＝毎回ちらつかない）。逆に**再生させたい場合は
 *    `key` を変えて作り直す**しかない。`useFocusEffect` を足さないこと。
 *
 * ⚠️ **FlashList / FlatList の行に使わない。** セルは使い回されるので、スクロールする
 *    たびに古い行が「新しく現れ直す」ように見える。リストで使ってよいのは
 *    `ListHeaderComponent` の中の静的な塊だけ。
 *
 * ⚠️ **`onLayout` で位置を測っている View を包まない。** `layout.y` は**親からの
 *    相対位置**なので、包むと親がこの箱になって **y がほぼ 0 になる。**
 *    測る View を外側、`Appear` を内側にすること（`revenue.tsx` を一度これで壊した）。
 *    ⚠️ 「`transform` はレイアウトを動かさないから安全」は別の話。原因は**親が変わること。**
 *
 * ⚠️ **`overflow: "hidden"` を持つ親の中で使っても影は消えない**（この箱自身は
 *    クリップしないため）。ただし包む相手が影を持つカードなら、
 *    影と角丸を同じ View に置かない規則はそのまま守ること（docs/traps.md）。
 */
export function Appear({
  children,
  /** 何番目に現れるか。0 から順に少しずつ遅れて出る。⚠️ 大きくしすぎると最後まで待たされる */
  index = 0,
  style,
}: {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  /**
   * 出きったか。**true になったらアニメーション用のスタイルを外す**（＝素の View に戻る）。
   *
   * ⚠️ **これが「必ず見える」ことの保証。** 中身は `opacity: 0` から始まるので、
   *    アニメーションが走らないまま止まると**画面が丸ごと空白のまま残る。**
   *    ホーム・設定・収益は中身をほぼ全部包んでいるので、1 つ止まるだけで
   *    「何も表示されない画面」になる。
   */
  const [settled, setSettled] = useState(reduceMotion);

  useEffect(() => {
    if (settled) return;

    const delay = Math.min(index, MAX_STAGGER_INDEX) * STAGGER;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      delay,
      easing: Easing.out(Easing.cubic),
      /* ⚠️ web では効かず「native animated module is missing」の警告が出るが、
            JS 側の実装に落ちるだけで動く（実機ではネイティブ駆動になる） */
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setSettled(true);
    });

    /**
     * ⚠️ **保険。消さないこと。** ネイティブ駆動のアニメーションは、画面が
     *    まだ画面に付いていない／凍結されている（react-native-screens が
     *    非表示のタブを freeze する）間に start すると**走らないことがある。**
     *    その場合 `finished` のコールバックも来ないので、時間で打ち切って
     *    確実に見える状態へ倒す。**遅れて出るのは許容できるが、出ないのは許容できない。**
     */
    const safety = setTimeout(() => setSettled(true), delay + DURATION + SAFETY_MARGIN);

    return () => {
      animation.stop();
      clearTimeout(safety);
    };
  }, [progress, index, settled]);

  return (
    <Animated.View
      style={[
        style,
        /* ⚠️ 出きったら animated なスタイルごと外す。付けたままにすると、
              ネイティブ側のノードが残り続けるうえ、値が壊れたときに再び消える */
        !settled && {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** 1 枚が現れきるまで */
const DURATION = 320;

/** 1 枚ずつずらす量。⚠️ 詰めすぎると一斉に出て階段に見えず、開けすぎると遅く感じる */
const STAGGER = 60;

/**
 * ずらしの上限。
 * ⚠️ **これが無いと、下のほうのカードが延々と待たされる。** 画面に 10 枚あると
 *    最後の 1 枚は 0.6 秒後に動き始めることになり、読み込みが遅いように見える。
 */
const MAX_STAGGER_INDEX = 5;

/** 現れるときに持ち上がる距離 */
const RISE = 12;

/**
 * 予定の終了時刻からどれだけ待って「出なかった」と判断するか。
 * ⚠️ 短くしすぎるとアニメーションの途中で打ち切って飛んで見える。
 */
const SAFETY_MARGIN = 500;

/**
 * 「視差効果を減らす」（設定 → アクセシビリティ → 動作）が入っているか。
 *
 * ⚠️ **同期で読めないので起動時に 1 回だけ引いて持っておく。** `Appear` の
 *    `useEffect` は描画のあとに走るので、ここで Promise を待つと
 *    1 フレーム透明のままちらつく。
 * ⚠️ 起動直後の 1 枚目だけは既定（false = 動かす）で動くことがある。
 *    設定を切り替えた直後も次の画面から効く。
 */
let reduceMotion = false;

AccessibilityInfo.isReduceMotionEnabled()
  .then((enabled) => {
    reduceMotion = enabled;
  })
  .catch(() => {});

AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
  reduceMotion = enabled;
});
