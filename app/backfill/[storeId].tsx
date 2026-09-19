import { useMemo, useState } from "react";
import {
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
import { useStore } from "@/api/queries";
import { BackfillRow, type BackfillEntry } from "@/components/backfill/BackfillRow";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { Button, CenterMessage, MoneyText, Muted, Screen } from "@/components/common/ui";
import { earliestSelectableEpoch, MAX_MONTHS_BACK } from "@/components/revenue/monthIndex";
import { enqueue, OUTBOX_LIMIT } from "@/offline/outbox";
import { useOutbox } from "@/offline/OutboxProvider";
import { nowInJst, toJstMidnightEpoch } from "@/shared/date";
import { makeUuid } from "@/shared/uuid";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * 過去の集金データの一括入力。
 *
 * 新規ユーザーが「これまでの記録を入れ直すのが面倒」で離脱するのを避けるための画面。
 * 収益グラフを埋めるのが目的なので、機種別の内訳は取らず「日付 + 合計金額」だけを受ける
 * （collect_funds は fundsArray: [] + totalFunds でも成立する。集金入力画面の合計モードと同じ形）。
 *
 * ⚠️ 送信は必ず Outbox 経由（CLAUDE.md）。直接 POST しない。
 * ⚠️ Outbox には上限（OUTBOX_LIMIT）がある。一度に積める行数は outboxRemaining() で決まる。
 */
export default function Backfill() {
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const { items, isOnline, flush } = useOutbox();
  const { data: store, isLoading } = useStore(storeId);

  const todayEpoch = useMemo(() => toJstMidnightEpoch(nowInJst()), []);
  /**
   * 選べるいちばん古い日。
   * ⚠️ これより古い日付を入れても収益グラフに出せないので、最初から選ばせない
   *    （月別売上カードが遡れるのは MAX_MONTHS_BACK か月ぶんまで）。
   */
  const minEpoch = useMemo(() => earliestSelectableEpoch(), []);
  const [rows, setRows] = useState<BackfillEntry[]>(() => [
    { id: makeUuid(), date: todayEpoch, amount: "" },
  ]);
  /** カレンダーを開いている行。同時に開くのは 1 つだけ */
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 一度に積める上限。items は Outbox の購読なので、入力中に送信が捌ければ自動で増える
  const capacity = Math.max(0, OUTBOX_LIMIT - items.length);

  const filled = rows.filter((r) => Number(r.amount) > 0);
  const total = filled.reduce((sum, r) => sum + Number(r.amount), 0);

  /** 同じ日付が 2 行以上あるか。登録は妨げず、注意だけ出す */
  const duplicatedDates = useMemo(() => {
    const seen = new Map<number, number>();
    rows.forEach((r) => seen.set(r.date, (seen.get(r.date) ?? 0) + 1));
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([d]) => d));
  }, [rows]);

  function addRow() {
    setRows((prev) => {
      if (prev.length >= capacity) return prev;
      // 直前の行と同じ日付から始める。集金間隔は店舗ごとに違うので自動で遡らせない
      const last = prev[prev.length - 1];
      return [...prev, { id: makeUuid(), date: last?.date ?? todayEpoch, amount: "" }];
    });
  }

  function updateRow(id: string, patch: Partial<BackfillEntry>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
    setOpenRowId((cur) => (cur === id ? null : cur));
  }

  async function onCancel() {
    const dirty = rows.some((r) => r.amount.trim() !== "");
    if (dirty) {
      const ok = await dialog.confirm({
        title: "入力をやめますか？",
        message: "入力した内容は保存されません",
        confirmLabel: "やめる",
        cancelLabel: "入力を続ける",
        destructive: true,
      });
      if (!ok) return;
    }
    router.back();
  }

  async function onSubmit() {
    if (!store) return;

    if (filled.length === 0) {
      void dialog.alert({
        title: "金額が入力されていません",
        message: "1 件以上、金額を入れてください",
      });
      return;
    }
    if (filled.length > capacity) {
      void dialog.alert({
        title: "未送信データが上限に達しています",
        message: `一度に登録できるのはあと ${capacity} 件です。先に送信を完了してください`,
      });
      return;
    }

    const ok = await dialog.confirm({
      title: `${filled.length} 件を登録しますか？`,
      message: `合計 ¥${total.toLocaleString()} を ${store.store}店 の集金データとして登録します`,
      confirmLabel: "登録する",
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      filled.forEach((r) => {
        // ⚠️ Idempotency-Key は行ごとに別のものを振る。使い回すと 1 件しか登録されない
        const requestId = makeUuid();
        enqueue(
          {
            storeId: store.id,
            store: store.store,
            date: r.date,
            // 過去分は内訳を取らないので空。合計モードの集金入力と同じ形
            fundsArray: [],
            totalFunds: Number(r.amount),
          },
          requestId
        );
      });

      void flush();
      toast.success(
        isOnline
          ? `${filled.length} 件の集金データを登録しました`
          : `${filled.length} 件を送信待ちに追加しました。電波が戻ると自動送信されます`
      );
      router.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <Screen><CenterMessage text="読み込み中…" /></Screen>;
  if (!store) return <Screen><CenterMessage text="店舗が見つかりませんでした" /></Screen>;

  const atCapacity = rows.length >= capacity;

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => void onCancel()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={color.teal} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>過去の集金データ</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{store.store}店</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={16} color={color.teal} />
            <Text style={styles.noteText}>
              過去分は「集金日」と「合計金額」だけを登録します。機種ごとの内訳は残りません。
              収益グラフに出せる範囲に合わせ、さかのぼれるのは{Math.floor(MAX_MONTHS_BACK / 12)}年前までです。
            </Text>
          </View>

          {rows.map((entry, i) => (
            <BackfillRow
              key={entry.id}
              index={i}
              entry={entry}
              expanded={openRowId === entry.id}
              duplicated={duplicatedDates.has(entry.date)}
              minEpoch={minEpoch}
              onToggleCalendar={() =>
                setOpenRowId((cur) => (cur === entry.id ? null : entry.id))
              }
              onChangeDate={(date) => {
                updateRow(entry.id, { date });
                // 日を選んだらカレンダーは閉じる。行が多いと開きっぱなしでは
                // 次の行に届くまで延々スクロールすることになるため。
                // ⚠️ 年・月を選んだ時点では閉じない（CalendarPicker が onChange を
                //    呼ぶのは日を選んだときと「今日」だけ）
                setOpenRowId(null);
              }}
              onChangeAmount={(amount) =>
                // 数字以外は捨てる。全角や記号が混ざると Number() が NaN になるため
                updateRow(entry.id, { amount: amount.replace(/[^0-9]/g, "") })
              }
              onRemove={() => removeRow(entry.id)}
            />
          ))}

          <Button
            label={atCapacity ? `これ以上は追加できません（上限 ${capacity} 件）` : "行を追加"}
            variant="ghost"
            icon="add"
            disabled={atCapacity}
            onPress={addRow}
          />

          {atCapacity && (
            <Muted style={{ marginTop: spacing.sm, textAlign: "center" }}>
              先に登録して送信を終えると、続きを入力できます
            </Muted>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.summary}>
            <Muted>{filled.length} 件</Muted>
            <MoneyText value={total} size={22} tone="deeper" />
          </View>
          <Button
            label="登録する"
            variant="gradient"
            icon="cloud-upload-outline"
            loading={submitting}
            disabled={filled.length === 0}
            onPress={() => void onSubmit()}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: color.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  headerButton: { width: HIT_SIZE, height: HIT_SIZE, alignItems: "center", justifyContent: "center" },
  headerTitle: { textAlign: "center", fontFamily: font.uiBold, fontSize: 17, color: color.textMain },
  headerSub: { textAlign: "center", fontFamily: font.ui, fontSize: 12, color: color.textMuted },

  note: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: color.tealPale,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  noteText: { flex: 1, fontFamily: font.ui, fontSize: 13, color: color.tealDeeper, lineHeight: 19 },

  footer: {
    borderTopWidth: 1,
    borderTopColor: color.divider,
    backgroundColor: color.cardBg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
