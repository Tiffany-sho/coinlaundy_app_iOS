import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  activePaymentMethods,
  useBootstrap,
  useSetCollectMethod,
  useStore,
} from "@/api/queries";
import { CalendarPicker, formatJstDateLong } from "@/components/common/CalendarPicker";
import { Divider, SectionHead } from "@/components/common/section";
import { DialogProvider, useDialog } from "@/components/common/dialog";
import { ToastProvider, useToast, type ToastApi } from "@/components/common/toast";
import { CenterMessage, Screen } from "@/components/common/ui";
import { useKeyboardVisible } from "@/components/common/useKeyboardVisible";
import {
  CollectFooter,
  CollectHeader,
  CollectOfflineNote,
  DraftBanner,
} from "@/components/collect/CollectChrome";
import {
  CollectMethodSection,
  MachineAmountRows,
  TotalAmountInput,
  type MachineRow,
} from "@/components/collect/CollectAmountInputs";
import { clearDraft, createDebouncedSave, loadDraft, saveDraft } from "@/offline/draft";
import { enqueue, isOutboxFull } from "@/offline/outbox";
import { markCollectRegistered } from "@/push/pushToken";
import { useOutbox } from "@/offline/OutboxProvider";
import {
  CashlessInputs,
  cashlessTotal,
  toCashlessEntries,
} from "@/components/collect/CashlessInputs";
import { toCollectScope } from "@/components/collect/collectScope";
import type { CashlessEntry, Draft } from "@/offline/types";
import { COIN_VALUE, weightToCoins } from "@/shared/collectMoney";
import { nowInJst, toJstMidnightEpoch } from "@/shared/date";
import { makeUuid } from "@/shared/uuid";
import { color, font, radius, spacing, HIT_SIZE, numeric } from "@/theme/tokens";

/**
 * 集金入力。Web の CollectMoneyForm.jsx に構造を合わせてある。
 *   ヘッダ（固定）→ 下書きバナー → 集金日 → 集金方式 → 金額入力 → フッタ（固定）
 *
 * 見た目は components/collect/ に切り出してある。ここは状態と送信だけ。
 */
/**
 * ⚠️ **この画面の中に DialogProvider をもう 1 つ置いている。**
 *
 * この画面はアプリで唯一 `presentation: "fullScreenModal"`（`app/_layout.tsx`）で、
 * react-native-screens が**ルートの UIViewController から新しい VC をモーダル表示**する。
 * 一方ルートの DialogProvider が持つ `Modal` はルートの React ツリーに属するので、
 * iOS では「すでにモーダルを出している VC から更にモーダルを出す」ことになり
 * **何も表示されずに失敗する**（Metro に
 * "Attempt to present ... which is already presenting ..." が出る）。
 *
 * `onCancel` は入力があると `dialog.choose` の結果を待つため、ダイアログが出ないと
 * **キャンセルも戻るも無反応になる。** ここで包み直すと `Modal` が
 * この画面側の VC に属するので正しく上に出る。
 *
 * `ToastProvider` も同じ理由でルートのものはこの画面の下に隠れる（`position: "absolute"`
 * のオーバーレイなので `Modal` ですらない）。こちらも包み直すが、**2 つを使い分ける。**
 *
 * ⚠️ **`router.back()` の直前に出すトーストはルート側（`rootToast`）を使うこと。**
 *    ネスト側で出すと画面のアンマウントと同時に消えて一瞬も読めない。
 *    逆に画面に留まる入力検証のエラーは**ネスト側**でないと見えない。
 *    だから包む前にルート側を掴んでおき、両方を持ったまま下へ渡している。
 */
export default function CollectMoneyModal() {
  // ⚠️ 包む前に掴む。ここで useToast() を呼ぶとルート側の ToastProvider に解決される
  const rootToast = useToast();
  return (
    <DialogProvider>
      <ToastProvider>
        <CollectMoney rootToast={rootToast} />
      </ToastProvider>
    </DialogProvider>
  );
}

/**
 * @param rootToast 画面を離れたあとも残るトースト。`router.back()` の直前に使う。
 *                  この画面に留まるときは `useToast()`（ネスト側）を使う
 */
function CollectMoney({ rootToast }: { rootToast: ToastApi }) {
  const { storeId, scope } = useLocalSearchParams<{ storeId: string; scope?: string }>();
  /**
   * 何を記録するか。⚠️ **未指定は「両方」。** 通知のディープリンクなど
   * scope を持たない経路から開かれたときに、**入力欄が黙って消えている**
   * 状態にしないため（`toCollectScope` の説明を参照）。
   */
  const collectScope = toCollectScope(scope);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const { data: store, isLoading } = useStore(storeId);
  const bootstrap = useBootstrap();
  const setCollectMethod = useSetCollectMethod();
  /*
    ⚠️ **支払方法は店舗ごと**（009）。`GET /stores/:id` の応答に乗っているので
       別のクエリは張らない。⚠️ 使用停止中のものは新しく選ばせない
       （過去の記録には残っている）。
  */
  const storeMethods = activePaymentMethods(store);
  /**
   * 画面に出す支払方法。⚠️ **`scope === "cash"` のときは空にする。**
   * 空にすると入力欄も下書きの復元も送信も一斉に止まるので、
   * 「現金のみ」を選んだのにキャッシュレスが混ざる経路が残らない。
   */
  const activeMethods = collectScope === "cash" ? [] : storeMethods;
  /** 現金（硬貨・合計金額）の欄を出すか。⚠️ 出さないときは金額も 0 で送る */
  const showCash = collectScope !== "cashless";
  const { flush, isOnline } = useOutbox();

  const [epoch, setEpoch] = useState(() => toJstMidnightEpoch(nowInJst()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [byMachine, setByMachine] = useState(false);
  /** 「次回もこの集金方式を使う」。profiles.collectMethod が null 以外なら ON */
  const [fixedMethod, setFixedMethod] = useState(false);
  const [methodReady, setMethodReady] = useState(false);
  const [rows, setRows] = useState<MachineRow[]>([]);
  const [totalInput, setTotalInput] = useState("");
  /**
   * キャッシュレスの入力。methodId → 数字だけの文字列。
   * ⚠️ **単位は「円」。** 機種別入力（枚数）と混ぜないこと。
   */
  const [cashless, setCashless] = useState<Record<string, string>>({});
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

  /**
   * 現金ぶんの金額。
   * ⚠️ **サーバへ送るのはこの値。** DB の totalFunds は現金 + キャッシュレスの
   *    総額だが、**組み立てるのはサーバ（createData）**。ここで足して送ると二重計上になる。
   */
  const cashTotal = useMemo(() => {
    // ⚠️ 「現金以外のみ」では欄を出していないので必ず 0。下書きから復元された
    //    枚数が残っていても数えない（画面に出ていない金額を送らないため）
    if (!showCash) return 0;
    if (!byMachine) {
      const n = Number(totalInput);
      return Number.isFinite(n) ? n : 0;
    }
    return rows.reduce((sum, r) => sum + (r.funds ?? 0), 0) * COIN_VALUE;
  }, [showCash, byMachine, totalInput, rows]);

  /**
   * キャッシュレスの合計。
   * ⚠️ **機種別入力では機器ごとの欄の和**、合計入力では下の 1 か所の和。
   *    片方だけ見ると、方式を切り替えたときに総額が合わなくなる。
   */
  const cashlessSum = useMemo(
    () =>
      byMachine
        ? rows.reduce((sum, r) => sum + cashlessTotal(r.cashless ?? {}), 0)
        : cashlessTotal(cashless),
    [byMachine, rows, cashless]
  );

  /** 画面に出す総額。⚠️ こちらは足す（利用者が見るのは受け取った合計） */
  const total = cashTotal + cashlessSum;

  const hasInput =
    (showCash &&
      (byMachine
        ? rows.some((r) => r.funds !== null || r.weight !== null)
        : totalInput.trim() !== "")) ||
    cashlessSum > 0;

  // 入力が変わるたびに自動保存する（アプリが落ちても失わない）
  useEffect(() => {
    if (!initialized || !storeId || !store || !hasInput) return;
    debounced.schedule(buildDraft());
    return () => debounced.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, totalInput, cashless, epoch, byMachine, initialized, hasInput]);

  function buildDraft(): Draft {
    return {
      storeId: storeId!,
      storeName: store!.store,
      date: epoch,
      method: byMachine ? "byMachine" : "total",
      fundsArray: rows.map((r) => ({
        id: r.id,
        name: r.name,
        funds: r.funds ?? 0,
        // ⚠️ 機器ごとのキャッシュレスも下書きに残す。落とすと復元で消える
        cashless: toCashlessEntries(activeMethods, r.cashless ?? {}),
      })),
      totalInput: Number(totalInput) || 0,
      cashless: toCashlessEntries(activeMethods, cashless),
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
        // ⚠️ 直後に router.back() するのでルート側。ネスト側だと消える
        rootToast.success("入力内容を一時保存しました");
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
      updateRow(row.id, { toggle: false, funds: row.weight ? weightToCoins(row.weight) : null });
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
    /*
      ⚠️ **`?? []` を必ず通す。** この項目を足す前に保存された下書きが
         MMKV に残っている端末では `cashless` が undefined。型は必須に見えても
         実体が無く、TypeScript は何も言わない。
      ⚠️ 使用停止になった支払方法が下書きに残っていることがあるので、
         **今も使えるものだけ**戻す（送っても弾かれる）。
    */
    const toAmounts = (entries: CashlessEntry[] | undefined) => {
      const out: Record<string, string> = {};
      for (const entry of entries ?? []) {
        if (activeMethods.some((m) => m.id === entry.methodId)) {
          out[entry.methodId] = String(entry.amount);
        }
      }
      return out;
    };

    setCashless(toAmounts(pendingDraft.cashless));
    setRows((prev) =>
      prev.map((r) => {
        const saved = pendingDraft.fundsArray.find((f) => f.id === r.id);
        // ⚠️ 機器ごとのキャッシュレスも戻す。落とすと復元したのに金額が消える
        return saved
          ? { ...r, funds: saved.funds || null, cashless: toAmounts(saved.cashless) }
          : r;
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
          /*
            ⚠️ **機種別入力ではキャッシュレスも機器ごとに載せる。**
               サーバ（createData）が機器ぶんを足し合わせて集金レコードの
               `cashless` 列を組み直す。⚠️ **そのとき集金レベルの `cashless` は
               無視される**ので、ここで両方送っても二重計上にはならないが、
               紛らわしいので機種別では送らない。
          */
          fundsArray: byMachine
            ? rows.map((r) => ({
                id: r.id,
                name: r.name,
                funds: r.funds ?? 0,
                cashless: toCashlessEntries(activeMethods, r.cashless ?? {}).map((e) => ({
                  methodId: e.methodId,
                  amount: e.amount,
                })),
              }))
            : [],
          /*
            ⚠️ **現金ぶんだけを送る。** DB の totalFunds は現金 + キャッシュレスの
               総額だが、組み立てるのはサーバ（createData）。画面に出している
               `total` を送ると**キャッシュレスが二重に計上される。**
          */
          totalFunds: cashTotal,
          cashless: byMachine
            ? []
            : toCashlessEntries(activeMethods, cashless).map((e) => ({
                methodId: e.methodId,
                amount: e.amount,
              })),
        },
        requestId
      );

      // 集金方式の既定値はチェックを操作した時点で保存済みなので、ここでは何もしない
      clearDraft(store!.id);
      void flush();
      // 通知許可を聞く合図。⚠️ ここでは聞かない。iOS は Modal の上に Modal を
      // 重ねられないので、閉じてホームに戻ってから usePushPriming が出す
      markCollectRegistered();
      // 触覚はトースト側が鳴らすのでここでは鳴らさない（二重に振動するため）
      // ⚠️ 直後に router.back() するのでルート側。ネスト側だと消える
      rootToast.success(
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
      {/* ⚠️ 戻るはフッタのキャンセルと同じ onCancel を通す（確認の有無を揃えるため） */}
      <CollectHeader storeName={store.store} topInset={insets.top} onBack={onCancel} />
      {!isOnline && <CollectOfflineNote />}

      {/*
        ⚠️ keyboardVerticalOffset を渡さないこと（0 が正しい）。
        behavior="padding" の下パディングは
          frame.y + frame.height - (keyboard.screenY - keyboardVerticalOffset)
        で決まる。frame は親（Screen）基準なので、上の CollectHeader の高さは
        frame.y に既に入っている。ここで insets.top + 60 を渡すとヘッダ分を
        二重に数えて、ScrollView の下端がキーボードの上端より約 119px 高くなり、
        キーボードとの間に帯状の余白が出る。
        このオフセットが要るのは KeyboardAvoidingView の上に**ネイティブの**
        ナビゲーションヘッダがある（RN のレイアウトに含まれない）ときだけ。
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {pendingDraft && (
            <DraftBanner
              draft={pendingDraft}
              onRestore={restoreDraft}
              onDiscard={() => {
                clearDraft(storeId!);
                setPendingDraft(null);
              }}
            />
          )}

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

          <CollectMethodSection
            byMachine={byMachine}
            fixedMethod={fixedMethod}
            onChangeMethod={changeMethod}
            onChangeFixed={changeFixedMethod}
          />

          <Divider />

          <SectionHead
            icon="cash-outline"
            label={
              byMachine
                ? showCash
                  ? "機種別金額"
                  : "機種別（現金以外）"
                : showCash
                  ? "合計金額"
                  : "合計（現金以外）"
            }
          />
          {byMachine ? (
            <MachineAmountRows
              rows={rows}
              methods={activeMethods}
              showCash={showCash}
              onChange={updateRow}
              onToggle={toggleRow}
            />
          ) : showCash ? (
            <TotalAmountInput value={totalInput} onChange={setTotalInput} />
          ) : (
            /* ⚠️ 合計入力 × 現金以外のみ。金額の欄は下のキャッシュレスの節だけになる */
            <CashlessInputs
              methods={activeMethods}
              amounts={cashless}
              onChange={(methodId, value) =>
                setCashless((prev) => ({ ...prev, [methodId]: value }))
              }
            />
          )}

          {/*
            ⚠️ **支払方法が 1 件も無い店舗では節ごと出さない。** 案内だけの空欄が
               毎回挟まると、現金しか扱わない店舗の入力が 1 画面ぶん長くなる。
            ⚠️ **機種別入力のときも出さない。** あちらは機器ごとに欄があるので、
               ここにも出すと同じ金額を 2 か所へ入れられてしまう
               （サーバは機器ぶんを正とするので、ここの入力は黙って捨てられる）。
            ⚠️ **現金以外のみのときも出さない。** その場合は上の「合計」の位置に
               同じ入力欄を出しているので、ここにも出すと二重になる。
            ⚠️ 単位は「円」。すぐ上の機種別入力は**枚数**なので混ぜないこと。
          */}
          {!byMachine && showCash && activeMethods.length > 0 && (
            <>
              <Divider />
              <SectionHead icon="card-outline" label="キャッシュレス" />
              <CashlessInputs
                methods={activeMethods}
                amounts={cashless}
                onChange={(methodId, value) =>
                  setCashless((prev) => ({ ...prev, [methodId]: value }))
                }
              />
            </>
          )}
        </ScrollView>

        {/*
          ⚠️ footer は KeyboardAvoidingView の**中**に置く。外に出すとキーボードの
          裏に完全に隠れ、合計収益額が見えないうえ、いったんキーボードを閉じないと
          登録できない。中に置くと padding の内側に入るのでキーボードの真上に乗る。
        */}
        <CollectFooter
          total={total}
          bottomInset={insets.bottom}
          keyboardVisible={keyboardVisible}
          submitting={submitting}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  dateText: { ...numeric, fontSize: 17, color: color.textMain },
  dateHint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, marginTop: 2 },
});
