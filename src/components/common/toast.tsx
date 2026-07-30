import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { color, font, radius, shadow, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * トースト。Web の showToast()（functions/makeToast/toast.js）に相当する。
 *
 * 成功・失敗を必ず知らせるために使う。特に次の操作は結果が画面から読み取りにくいので
 * 出すこと：店舗の追加・編集・削除、集金データの追加・編集・削除、在庫の更新、
 * 組織・個人情報の編集。
 *
 * ⚠️ 確認を取る用途には使わないこと。それは src/components/common/dialog.tsx の役割。
 */

type ToastKind = "success" | "error" | "info";

export type ToastApi = {
  show: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** 表示時間。失敗は読ませたいので長め */
const DURATION: Record<ToastKind, number> = {
  success: 2600,
  error: 4200,
  info: 3000,
};

const STYLE: Record<
  ToastKind,
  { bg: string; fg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }
> = {
  success: { bg: color.tealDeeper, fg: "#FFFFFF", icon: "checkmark-circle" },
  error: { bg: color.red500, fg: "#FFFFFF", icon: "alert-circle" },
  info: { bg: color.gray800, fg: "#FFFFFF", icon: "information-circle" },
};

/**
 * 画面上端の「戻る」ボタンを避けるための高さ。
 *
 * ⚠️ **詰めないこと。トーストは Pressable なので、重なると見た目だけでなく
 *    戻るボタンが押せなくなる**（成功トーストで 2.6 秒、失敗で 4.2 秒）。
 *    各画面のヘッダは `paddingTop: insets.top + spacing.sm` に HIT_SIZE の
 *    ボタンを置く形で揃えてあるので、その下端 + 余白ぶん下げる。
 */
const HEADER_CLEARANCE = spacing.sm + HIT_SIZE + spacing.xs;

type ToastState = { id: number; kind: ToastKind; message: string };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const api = useMemo<ToastApi>(() => {
    function show(kind: ToastKind, message: string) {
      if (timer.current) clearTimeout(timer.current);
      nextId.current += 1;
      setToast({ id: nextId.current, kind, message });

      // 手が塞がっている現場でも成否が分かるように触覚も返す
      const feedback =
        kind === "error"
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Success;
      if (kind !== "info") Haptics.notificationAsync(feedback).catch(() => {});

      timer.current = setTimeout(() => setToast(null), DURATION[kind]);
    }

    return {
      show,
      success: (message) => show("success", message),
      error: (message) => show("error", message),
      info: (message) => show("info", message),
    };
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const style = STYLE[toast.kind];

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      /* タブバーやキーボードに隠れないよう画面上部に出す。
         ⚠️ ただし上端いっぱいには出さない（HEADER_CLEARANCE を参照） */
      style={[
        styles.wrap,
        {
          top: insets.top + HEADER_CLEARANCE,
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) },
          ],
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: style.bg }]}
      >
        <Ionicons name={style.icon} size={18} color={style.fg} />
        <Text style={[styles.message, { color: style.fg }]}>{toast.message}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast は ToastProvider の内側で呼ぶこと");
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: 480,
    width: "100%",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow.hero,
  },
  message: { flex: 1, fontFamily: font.uiBold, fontSize: 14, lineHeight: 20 },
});
