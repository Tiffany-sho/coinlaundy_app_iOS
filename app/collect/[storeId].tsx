import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useBootstrap, useSetCollectMethod, useStore } from "@/api/queries";
import { CalendarPicker, formatJstDateLong } from "@/components/CalendarPicker";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { CenterMessage, Muted, Screen } from "@/components/ui";
import { clearDraft, createDebouncedSave, loadDraft, saveDraft } from "@/offline/draft";
import { enqueue, isOutboxFull } from "@/offline/outbox";
import { useOutbox } from "@/offline/OutboxProvider";
import type { Draft } from "@/offline/types";
import { COIN_VALUE, weightToCoins } from "@/shared/collectMoney";
import { nowInJst, toJstMidnightEpoch } from "@/shared/date";
import { color, font, radius, shadow, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * 集金入力。Web の CollectMoneyForm.jsx に構造を合わせてある。
 *   ヘッダ（固定）→ 下書きバナー → 集金日 → 集金方式 → 金額入力 → フッタ（固定）
 *
 * 機種ごとに「枚数」と「質量」を別々に保持し、⟳ ボタンで表示を切り替える。
 * 質量から枚数へは切り替えた瞬間に換算する（Web と同じ挙動）。
 */
type MachineRow = {
  id: string;
  name: string;
  /** 硬貨の枚数 */
  funds: number | null;
  /** 100 円玉の質量（g） */
  weight: number | null;
  /** true なら質量入力モード */
  toggle: boolean;
};

export default function CollectMoney() {
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const { data: store, isLoading } = useStore(storeId);
  const bootstrap = useBootstrap();
  const setCollectMethod = useSetCollectMethod();
  const { flush, isOnline } = useOutbox();

  const [epoch, setEpoch] = useState(() => toJstMidnightEpoch(nowInJst()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [byMachine, setByMachine] = useState(false);
  /** 「次回もこの集金方式を使う」。profiles.collectMethod が null 以外なら ON */
  const [fixedMethod, setFixedMethod] = useState(false);
  const [methodReady, setMethodReady] = useState(false);
  const [rows, setRows] = useState<MachineRow[]>([]);
  const [totalInput, setTotalInput] = useState("");
  const [requestId, setRequestId] = useState(() => makeUuid());
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const debounced = useRef(createDebouncedSave(1500)).current;

  /**
   * 「戻る」導線の入口をひとつに保つための参照。
   * onCancel は毎レンダーで作り直されるので、購読しっぱなしの BackHandler からは
   * この ref 越しに呼ぶ（直接渡すと最初のレンダーの hasInput を握ったままになる）。
   */
  const cancelRef = useRef<() => void>(() => router.back());

  // 店舗の機種で初期化する。下書きは自動復元せず、バナーで選ばせる（Web と同じ）
  useEffect(() => {
    if (!storeId || !store || initialized) return;

    setRows(
      (store.machines ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        funds: null,
        weight: null,
        toggle: false,
      }))
    );
    setPendingDraft(loadDraft(storeId));
    setInitialized(true);
  }, [storeId, store, initialized]);

  /**
   * 集金方式の初期反映。Web の useCollectMethod.js の load() をそのまま移した。
   *   collectMethod が null 以外 → その方式にして「固定する」を ON
   *   null                       → 合計集金にして「固定する」を OFF
   * null のとき機種別ではなく合計側に倒すのは本家の setChecked(false) と同じ。
   */
  useEffect(() => {
    if (methodReady || !bootstrap.data) return;
    const saved = bootstrap.data.profile?.collectMethod ?? null;
    setByMachine(saved === "machines");
    setFixedMethod(saved !== null);
    setMethodReady(true);
  }, [bootstrap.data, methodReady]);

  const total = useMemo(() => {
    if (!byMachine) {
      const n = Number(totalInput);
      return Number.isFinite(n) ? n : 0;
    }
    return rows.reduce((sum, r) => sum + (r.funds ?? 0), 0) * COIN_VALUE;
  }, [byMachine, totalInput, rows]);

  const hasInput = byMachine
    ? rows.some((r) => r.funds !== null || r.weight !== null)
    : totalInput.trim() !== "";

  // 入力が変わるたびに自動保存する（アプリが落ちても失わない）
  useEffect(() => {
    if (!initialized || !storeId || !store || !hasInput) return;
    debounced.schedule(buildDraft());
    return () => debounced.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, totalInput, epoch, byMachine, initialized, hasInput]);

  function buildDraft(): Draft {
    return {
      storeId: storeId!,
      storeName: store!.store,
      date: epoch,
      method: byMachine ? "byMachine" : "total",
      fundsArray: rows.map((r) => ({ id: r.id, name: r.name, funds: r.funds ?? 0 })),
      totalInput: Number(totalInput) || 0,
      clientRequestId: requestId,
      updatedAt: Date.now(),
    };
  }

  /**
   * 画面を離れるときの共通処理。
   *
   * ⚠️ 「戻る」の導線は複数あるので、必ず全部ここを通すこと。
   *    ヘッダの戻る（chevron）／ フッタのキャンセル／ Android の戻るキー。
   *    どれか 1 つでも素通りさせると、入力したまま画面を出て内容が消えたように見える。
   *    入力が空のときは何も聞かずに戻る。
   */
  function onCancel() {
    if (!hasInput) {
      debounced.cancel();
      router.back();
      return;
    }
    void (async () => {
      const action = await dialog.choose<"save" | "discard">({
        title: "入力内容を保存しますか？",
        message: "保存すると次回この店舗を開いたときに復元できます。",
        options: [
          { label: "一時保存して戻る", value: "save" },
          { label: "保存せず戻る", value: "discard", destructive: true },
        ],
      });
      if (!action) return;
      debounced.cancel();
      if (action === "save") {
        saveDraft(buildDraft());
        toast.success("入力内容を一時保存しました");
      } else if (storeId) {
        // 入力中は 1.5 秒ごとに自動保存しているので、破棄を選んだら
        // 書き込み済みの下書きも消す。消さないと次に開いたときバナーが出てしまう
        clearDraft(storeId);
      }
      router.back();
    })();
  }

  // 毎レンダーで最新の onCancel に差し替える（BackHandler から呼ぶのはこの中身）
  cancelRef.current = onCancel;

  /**
   * Android の戻るキーもキャンセルと同じ確認へ通す。
   * iOS はフルスクリーンモーダルでスワイプ戻しが無く、Web の BackHandler は
   * 未対応（呼ぶと console.error が出る）ので Android のみで購読する。
   */
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      cancelRef.current();
      return true; // 既定の pop は止める。実際に戻るかどうかは onCancel が決める
    });
    return () => sub.remove();
  }, []);

  if (isLoading || !store) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  function updateRow(id: string, patch: Partial<MachineRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  /** ⟳ ボタン。質量 → 枚数の換算は切り替えた瞬間に行う（Web と同じ） */
  function toggleRow(row: MachineRow) {
    Haptics.selectionAsync().catch(() => {});
    if (row.toggle) {
      // 質量入力 → 枚数入力。入っている質量を枚数に換算して持ち替える
      updateRow(row.id, {
        toggle: false,
        funds: row.weight ? weightToCoins(row.weight) : null,
      });
    } else {
      updateRow(row.id, { toggle: true });
    }
  }

  /**
   * 集金方式の切り替え。Web の handleMethodChange と同じで、
   * 「固定する」が ON のあいだは保存値も追従させる。
   */
  function changeMethod(next: boolean) {
    setByMachine(next);
    if (fixedMethod) setCollectMethod.mutate(next ? "machines" : "total");
  }

  /** 「次回もこの集金方式を使う」。Web の handleFixedChange と同じで、OFF なら null を保存する */
  function changeFixedMethod(next: boolean) {
    Haptics.selectionAsync().catch(() => {});
    setFixedMethod(next);
    setCollectMethod.mutate(next ? (byMachine ? "machines" : "total") : null);
  }

  function restoreDraft() {
    if (!pendingDraft) return;
    setEpoch(pendingDraft.date);
    setTotalInput(pendingDraft.totalInput ? String(pendingDraft.totalInput) : "");
    setRequestId(pendingDraft.clientRequestId);
    setRows((prev) =>
      prev.map((r) => {
        const saved = pendingDraft.fundsArray.find((f) => f.id === r.id);
        return saved ? { ...r, funds: saved.funds || null } : r;
      })
    );
    // 下書きに入っている方式へ戻す。ここを changeMethod に通しておかないと
    // 「固定する」が ON なのに画面の方式と保存値が食い違ってしまう
    changeMethod(pendingDraft.method === "byMachine");
    setPendingDraft(null);
  }

  async function onSubmit() {
    if (submitting) return;
    if (total <= 0) {
      toast.error("金額が入力されていません");
      return;
    }
    if (isOutboxFull()) {
      void dialog.alert({
        title: "未送信データが上限に達しています",
        message: "先に送信を完了してください",
      });
      return;
    }

    setSubmitting(true);
    debounced.cancel();
    try {
      enqueue(
        {
          storeId: store!.id,
          store: store!.store,
          date: epoch,
          fundsArray: byMachine
            ? rows.map((r) => ({ id: r.id, name: r.name, funds: r.funds ?? 0 }))
            : [],
          totalFunds: total,
        },
        requestId
      );

      // 集金方式の既定値はチェックを操作した時点で保存済みなので、ここでは何もしない
      clearDraft(store!.id);
      void flush();
      // 触覚はトースト側が鳴らすのでここでは鳴らさない（二重に振動するため）
      toast.success(
        isOnline
          ? "集金データを登録しました"
          : "送信待ちに追加しました。電波が戻ると自動送信されます"
      );
      router.back();
    } catch (e) {
      toast.error(
        e instanceof Error ? `登録できませんでした: ${e.message}` : "登録できませんでした"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      {/* ヘッダ（Web と同じ：戻る + コインアイコン + 店名 + 「集金中」） */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {/* 戻るはフッタのキャンセルと同じ onCancel を通す（確認の有無を揃えるため） */}
        <Pressable onPress={onCancel} hitSlop={12} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={22} color={color.textMuted} />
        </Pressable>
        <LinearGradient
          colors={["#0891B2", "#0E7490"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerIcon}
        >
          <Ionicons name="cash-outline" size={20} color="#FFFFFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {store.store}店
          </Text>
          <Text style={styles.headerSub}>集金中</Text>
        </View>
      </View>

      {!isOnline && (
        <View style={styles.offlineNote}>
          <Text style={styles.offlineNoteText}>
            オフライン — 登録すると送信待ちになり、電波が戻ると自動送信されます
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {pendingDraft && (
            <View style={styles.draftBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.draftTitle}>一時保存データがあります</Text>
                <Text style={styles.draftTime}>
                  保存日時: {new Date(pendingDraft.updatedAt).toLocaleString("ja-JP", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  clearDraft(storeId!);
                  setPendingDraft(null);
                }}
                style={styles.draftGhost}
              >
                <Text style={styles.draftGhostLabel}>破棄</Text>
              </Pressable>
              <Pressable onPress={restoreDraft} style={styles.draftPrimary}>
                <Text style={styles.draftPrimaryLabel}>復元</Text>
              </Pressable>
            </View>
          )}

          {/* ── 集金日 ── */}
          {/* Web の EpochTimeSelector と同じで、普段は日付だけ出しタップで選択欄を開く */}
          <SectionHead icon="calendar-outline" label="集金日" />
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setCalendarOpen((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: calendarOpen }}
            style={({ pressed }) => [styles.dateValue, pressed && { opacity: 0.85 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.dateText}>{formatJstDateLong(epoch)}</Text>
              <Text style={styles.dateHint}>タップして変更</Text>
            </View>
            <Ionicons
              name={calendarOpen ? "chevron-up" : "chevron-down"}
              size={20}
              color={color.teal}
            />
          </Pressable>
          {calendarOpen && (
            <CalendarPicker
              value={epoch}
              onChange={(next) => {
                setEpoch(next);
                setCalendarOpen(false);
              }}
              style={{ marginTop: spacing.sm }}
            />
          )}

          <Divider />

          {/* ── 集金方式 ── */}
          <View style={styles.methodRow}>
            <View style={{ flex: 1 }}>
              <SectionHead icon="cash-outline" label="集金方式" noMargin />
              <Muted style={{ marginTop: 4 }}>
                {byMachine ? "各機種ごとに金額を入力します" : "合計金額のみを入力します"}
              </Muted>
            </View>
            <Switch
              value={byMachine}
              onValueChange={(v) => {
                Haptics.selectionAsync().catch(() => {});
                changeMethod(v);
              }}
              trackColor={{ true: color.teal, false: "#CBD5E1" }}
            />
          </View>
          {/* Web の FixSwitch（「この状態に固定」）に当たるもの */}
          <Pressable
            style={styles.fixRow}
            onPress={() => changeFixedMethod(!fixedMethod)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: fixedMethod }}
            hitSlop={6}
          >
            <Ionicons
              name={fixedMethod ? "checkbox" : "square-outline"}
              size={20}
              color={fixedMethod ? color.teal : color.textFaint}
            />
            <Text style={styles.fixLabel}>次回もこの集金方式を使う</Text>
          </Pressable>

          <Divider />

          {/* ── 金額入力 ── */}
          <SectionHead icon="cash-outline" label={byMachine ? "機種別金額" : "合計金額"} />

          {byMachine ? (
            rows.map((row, index) => (
              <View key={row.id}>
                {index > 0 && <View style={styles.rowDivider} />}

                <View style={styles.machineHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.machineName}>{row.name}</Text>
                    <Text style={styles.machineHint}>
                      {row.toggle ? "質量から計算" : "枚数を入力"}
                    </Text>
                  </View>
                  <Pressable onPress={() => toggleRow(row)} style={styles.swapButton} hitSlop={8}>
                    <Ionicons name="refresh" size={16} color={color.teal} />
                  </Pressable>
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.addon}>
                    <Text style={styles.addonText}>{row.toggle ? "g" : "枚"}</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={
                      row.toggle
                        ? row.weight != null
                          ? String(row.weight)
                          : ""
                        : row.funds != null
                          ? String(row.funds)
                          : ""
                    }
                    onChangeText={(text) => {
                      const n = parseInt(text.replace(/[^0-9]/g, ""), 10);
                      const value = Number.isFinite(n) ? n : null;
                      updateRow(row.id, row.toggle ? { weight: value } : { funds: value });
                    }}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    placeholder={row.toggle ? "100円玉の質量を入力" : "100円玉の枚数を入力"}
                    placeholderTextColor={color.textFaint}
                  />
                </View>

                {row.funds != null && row.funds > 0 && (
                  <View style={styles.resultBox}>
                    <Text style={styles.resultText}>
                      合計: ¥{(row.funds * COIN_VALUE).toLocaleString()}
                    </Text>
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={styles.inputGroup}>
              <View style={styles.addon}>
                <Text style={[styles.addonText, { fontSize: 17 }]}>¥</Text>
              </View>
              <TextInput
                style={styles.input}
                value={totalInput}
                onChangeText={(t) => setTotalInput(t.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder="合計金額を入力してください"
                placeholderTextColor={color.textFaint}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* フッタ（Web と同じ：合計収益額 + 操作ボタン）。
          下端の余白はホームバー / ブラウザのツールバーに食われやすいので広めに取る */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footerLabel}>合計収益額</Text>
          <Text style={styles.footerTotal}>¥{total.toLocaleString()}</Text>
        </View>
        <Pressable onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelLabel}>キャンセル</Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitButton,
            pressed && { opacity: 0.85 },
            submitting && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.submitLabel}>登録</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function SectionHead({
  icon,
  label,
  noMargin,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  noMargin?: boolean;
}) {
  return (
    <View style={[styles.sectionHead, noMargin && { marginBottom: 0 }]}>
      <Ionicons name={icon} size={19} color={color.teal} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

/** expo-crypto を足さずに済ませるための簡易 uuid v4 */
function makeUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: color.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
    ...shadow.sm,
  },
  headerBack: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: font.uiBold, fontSize: 18, color: color.tealDeeper },
  headerSub: { fontFamily: font.ui, fontSize: 11, color: color.textMuted },
  offlineNote: { backgroundColor: color.orange500, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  offlineNoteText: { fontFamily: font.ui, fontSize: 12, color: "#FFFFFF", textAlign: "center" },

  draftBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  draftTitle: { fontFamily: font.uiBold, fontSize: 13, color: "#92400E" },
  draftTime: { fontFamily: font.ui, fontSize: 11, color: "#B45309", marginTop: 2 },
  draftGhost: {
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.card - 8,
    borderWidth: 1,
    borderColor: "#FCD34D",
    alignItems: "center",
    justifyContent: "center",
  },
  draftGhostLabel: { fontFamily: font.uiBold, fontSize: 12, color: "#B45309" },
  draftPrimary: {
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.card - 8,
    backgroundColor: "#D97706",
    alignItems: "center",
    justifyContent: "center",
  },
  draftPrimaryLabel: { fontFamily: font.uiBold, fontSize: 12, color: "#FFFFFF" },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  sectionLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.teal },
  divider: { height: 1, backgroundColor: color.divider, marginVertical: spacing.xl },
  rowDivider: { height: 1, backgroundColor: color.divider, marginVertical: spacing.lg },

  dateRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dateStep: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderRadius: radius.card,
    backgroundColor: color.tealPale,
    alignItems: "center",
    justifyContent: "center",
  },
  /** カレンダーの開閉ボタン。左に日付、右に chevron を置くので横並びにする */
  dateValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: HIT_SIZE,
    borderRadius: radius.card,
    backgroundColor: color.cardBg,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dateText: { fontFamily: font.mono, fontSize: 17, color: color.textMain },
  dateHint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, marginTop: 2 },

  methodRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  fixRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, minHeight: 40 },
  fixLabel: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },

  machineHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  machineName: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  machineHint: { fontFamily: font.ui, fontSize: 11, color: color.textMuted, marginTop: 2 },
  swapButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    backgroundColor: color.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },

  inputGroup: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: radius.card - 6,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    backgroundColor: color.cardBg,
    overflow: "hidden",
  },
  addon: {
    minWidth: 48,
    paddingHorizontal: spacing.md,
    backgroundColor: color.cyan100,
    alignItems: "center",
    justifyContent: "center",
  },
  addonText: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    fontFamily: font.ui,
    fontSize: 16,
    color: color.textMain,
  },
  resultBox: {
    marginTop: spacing.sm,
    backgroundColor: color.tealPale,
    borderRadius: radius.card - 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resultText: { fontFamily: font.uiBold, fontSize: 13, color: color.tealDeeper },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.cardBg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  footerLabel: { fontFamily: font.ui, fontSize: 11, color: color.textMuted },
  footerTotal: { fontFamily: font.uiBold, fontSize: 22, color: color.teal },
  cancelButton: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.card - 4,
    borderWidth: 2,
    borderColor: color.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelLabel: { fontFamily: font.uiBold, fontSize: 14, color: color.textMuted },
  submitButton: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.card - 4,
    backgroundColor: color.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  submitLabel: { fontFamily: font.uiBold, fontSize: 15, color: "#FFFFFF" },
});
