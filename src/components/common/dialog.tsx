import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, font, radius, shadow, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * 確認ダイアログ。
 *
 * ⚠️ React Native の Alert.alert() は **react-native-web では空関数**で、
 *    ブラウザでは何も起きない（node_modules/react-native-web/dist/exports/Alert/index.js が
 *    `class Alert { static alert() {} }`）。
 *    ブラウザ確認中に「削除ボタンが効かない」という形で表面化するため、
 *    Alert.alert は使わずこのダイアログを使うこと。Modal は Web でも実機でも動く。
 *
 * window.confirm を使う手もあるが、選択肢が 3 つ以上のケース（役割の変更など）を
 * 表現できず、見た目もアプリと揃わないので採らない。
 */

export type DialogOption<T> = {
  label: string;
  value: T;
  /** 破壊的な操作。赤字にする */
  destructive?: boolean;
  /**
   * 現在この値が選ばれている（並び替えの軸など）。チェックを付ける。
   * ⚠️ label に「（選択中）」と書き足さないこと。読み上げでも二重になる
   */
  selected?: boolean;
};

type DialogRequest = {
  title: string;
  message?: string;
  options: DialogOption<unknown>[];
  /** null を返して閉じるボタンの文言。省略時は「キャンセル」。null 指定で非表示 */
  cancelLabel?: string | null;
};

type DialogApi = {
  /** 選択肢から 1 つ選ばせる。キャンセルされたら null */
  choose: <T>(request: {
    title: string;
    message?: string;
    options: DialogOption<T>[];
    cancelLabel?: string | null;
  }) => Promise<T | null>;
  /** はい / いいえ。実行されたら true */
  confirm: (request: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }) => Promise<boolean>;
  /** 通知だけ。閉じたら解決する */
  alert: (request: { title: string; message?: string; closeLabel?: string }) => Promise<void>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  // 解決関数は再レンダリングをまたいで保持する。state に入れると閉じる前に消える
  const resolveRef = useRef<((value: unknown) => void) | null>(null);

  const close = useCallback((value: unknown) => {
    setRequest(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(value);
  }, []);

  const api = useMemo<DialogApi>(() => {
    function open(next: DialogRequest): Promise<unknown> {
      return new Promise((resolve) => {
        // 既に開いている場合は前の待ち手をキャンセル扱いで解放する（宙吊りを防ぐ）
        resolveRef.current?.(null);
        resolveRef.current = resolve as (value: unknown) => void;
        setRequest(next);
      });
    }

    return {
      choose: (r) =>
        open({
          title: r.title,
          message: r.message,
          options: r.options as DialogOption<unknown>[],
          cancelLabel: r.cancelLabel,
        }) as Promise<never>,

      confirm: (r) =>
        open({
          title: r.title,
          message: r.message,
          options: [
            {
              label: r.confirmLabel ?? "実行",
              value: true,
              destructive: r.destructive,
            },
          ],
          cancelLabel: r.cancelLabel ?? "キャンセル",
        }).then((value) => value === true),

      alert: (r) =>
        open({
          title: r.title,
          message: r.message,
          options: [{ label: r.closeLabel ?? "OK", value: true }],
          cancelLabel: null,
        }).then(() => undefined),
    };
  }, []);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        visible={request !== null}
        transparent
        animationType="fade"
        // Android の戻る / Web の Esc
        onRequestClose={() => close(null)}
      >
        {/* 背景タップで閉じる。破壊的操作でも「閉じる」＝キャンセルなので安全 */}
        <Pressable style={styles.backdrop} onPress={() => close(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>{request?.title}</Text>
            {request?.message ? <Text style={styles.message}>{request.message}</Text> : null}

            <View style={styles.actions}>
              {request?.options.map((option) => (
                <Pressable
                  key={option.label}
                  onPress={() => close(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: option.selected }}
                  style={({ pressed }) => [
                    styles.button,
                    option.destructive ? styles.buttonDanger : styles.buttonPrimary,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  {/* 選択中はチェックだけで示す。iOS のアクションシートと同じ作法 */}
                  {option.selected && (
                    <Ionicons
                      name="checkmark"
                      size={17}
                      color={option.destructive ? color.red500 : "#FFFFFF"}
                    />
                  )}
                  <Text
                    style={[
                      styles.buttonLabel,
                      option.destructive ? styles.buttonLabelDanger : styles.buttonLabelPrimary,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}

              {request?.cancelLabel !== null && (
                <Pressable
                  onPress={() => close(null)}
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonGhost,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.buttonLabel, styles.buttonLabelGhost]}>
                    {request?.cancelLabel ?? "キャンセル"}
                  </Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog は DialogProvider の内側で呼ぶこと");
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  sheet: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    padding: spacing.xl,
    ...shadow.hero,
  },
  title: { fontFamily: font.uiBold, fontSize: 17, color: color.textMain, textAlign: "center" },
  message: {
    fontFamily: font.ui,
    fontSize: 14,
    lineHeight: 21,
    color: color.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
  button: {
    minHeight: HIT_SIZE,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: { backgroundColor: color.teal },
  buttonDanger: { backgroundColor: color.cardBg, borderWidth: 2, borderColor: color.red400 },
  buttonGhost: { backgroundColor: color.cardBg, borderWidth: 1, borderColor: color.divider },
  buttonLabel: { fontFamily: font.uiBold, fontSize: 15 },
  buttonLabelPrimary: { color: "#FFFFFF" },
  buttonLabelDanger: { color: color.red500 },
  buttonLabelGhost: { color: color.textMuted },
});
