import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { activePaymentMethods } from "@/api/queries";
import { COLLECT_SCOPES, type CollectScope } from "@/components/collect/collectScope";
import { color, font, radius, shadow, spacing, HIT_SIZE } from "@/theme/tokens";
import type { Store } from "@/api/types";

/**
 * 「何を集金するか」を聞いてから集金画面へ送り出す。
 *
 * ⚠️ **支払方法が 1 件も無い店舗では聞かない。** 選択肢が「現金」しか無いのに
 *    1 タップ増えるだけになる。そのまま `scope=cash` で開く。
 *
 * ⚠️ **`router.push` はシートが閉じ切ってから行う。** 集金画面は
 *    `presentation: "fullScreenModal"` なので、モーダルを出したまま push すると
 *    iOS で VC の多重表示になり、**以降タブを切り替えても何も表示されなくなる。**
 *    閉じるアニメーションとの競合なので**毎回は起きない**（`docs/traps.md` の iOS）。
 *    `onDismiss` は iOS 専用なので、他プラットフォームは次のフレームで走らせる。
 *
 * ⚠️ **この待ち合わせを画面ごとに書き写さないこと。** 集金の入口は
 *    店舗一覧・店舗詳細・ホームのクイックアクションの 3 か所あり、
 *    1 つでも素通しにすると上の不具合がそこだけ再発する。
 *    （クイックアクションは店舗選択シートの中で選ばせるので別経路）
 */
export function useCollectLauncher() {
  const router = useRouter();
  /** 選択肢を出している店舗 */
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  /** シートが閉じ切るのを待っている遷移 */
  const [pending, setPending] = useState<{ storeId: string; scope: CollectScope } | null>(null);

  function go(storeId: string, scope: CollectScope) {
    router.push({ pathname: "/collect/[storeId]", params: { storeId, scope } });
  }

  function runPending() {
    if (!pending) return;
    const next = pending;
    setPending(null);
    go(next.storeId, next.scope);
  }

  useEffect(() => {
    if (Platform.OS === "ios" || pending === null || target !== null) return;
    const id = requestAnimationFrame(runPending);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, target]);

  /** 集金ボタンから呼ぶ。支払方法があれば聞き、無ければそのまま開く */
  function launch(store: Store) {
    if (activePaymentMethods(store).length === 0) {
      go(store.id, "cash");
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setTarget({ id: store.id, name: store.store });
  }

  return {
    launch,
    sheetProps: {
      visible: target !== null,
      storeName: target?.name ?? "",
      onPick: (scope: CollectScope) => {
        if (!target) return;
        setPending({ storeId: target.id, scope });
        setTarget(null);
      },
      onClose: () => setTarget(null),
      onDismiss: runPending,
    },
  };
}

const DESCRIPTIONS: Record<CollectScope, string> = {
  cash: "硬貨だけを記録します",
  cashless: "PayPay などで受け取ったぶんだけを記録します",
  both: "現金と現金以外の両方を記録します",
};

export function CollectScopeSheet({
  visible,
  storeName,
  onPick,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  storeName: string;
  onPick: (scope: CollectScope) => void;
  onClose: () => void;
  /** iOS で閉じ切ったあとに呼ばれる。⚠️ 遷移はここから行う */
  onDismiss?: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      {/* ⚠️ 背景と本体は兄弟にする（入れ子だと最初のタップを外側が取る） */}
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="閉じる" />
        <View style={styles.sheet}>
          <Text style={styles.title}>何を集金しますか？</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {storeName}店
          </Text>

          <View style={styles.options}>
            {COLLECT_SCOPES.map((scope) => (
              <Pressable
                key={scope.value}
                onPress={() => onPick(scope.value)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{scope.label}</Text>
                  <Text style={styles.optionHint}>{DESCRIPTIONS[scope.value]}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={color.cyan300} />
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.cancelLabel}>キャンセル</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: color.cardBg,
    borderRadius: radius.card,
    padding: spacing.xl,
    ...shadow.hero,
  },
  title: {
    fontFamily: font.uiBold,
    fontSize: 17,
    color: color.textMain,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: font.ui,
    fontSize: 13,
    color: color.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
  options: { marginTop: spacing.xl, gap: spacing.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: HIT_SIZE,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan200,
    backgroundColor: color.cyan50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  optionPressed: { backgroundColor: color.cyan100 },
  optionLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
  optionHint: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 2 },
  cancel: {
    minHeight: HIT_SIZE,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  cancelLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.textMuted },
});
