import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import {
  useBootstrap,
  useDeleteFund,
  useFundDetail,
  useUpdateFundData,
  useUpdateFundDate,
} from "@/api/queries";
import { ApiError } from "@/api/client";
import { CalendarPicker, formatJstDateLong } from "@/components/common/CalendarPicker";
import { Button, CenterMessage, Muted, Screen } from "@/components/common/ui";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { useOutbox } from "@/offline/OutboxProvider";
import { calcTotalFunds, entryAmount, COIN_VALUE } from "@/shared/collectMoney";
import { formatJstDate } from "@/shared/date";
import { color, font, radius, shadow, spacing } from "@/theme/tokens";
import type { FundEntry, FundListItem } from "@/api/types";

/**
 * 集金 1 件の詳細。収益ページの売上履歴カードから開く。
 *
 * Web の「履歴の行をタップ → 右から出るドロワー」
 * （CoinDataList.jsx の Drawer.Root → DrawerContext/CoinDataCard.jsx）を 1 画面にしたもの。
 * 並びも本家に合わせてある：
 *   集金日（EpochTimeSelector）→ 集金者 → 明細（MachineAndFundsList）→ 削除（AlertDialog）
 *
 * ── 遷移元との約束 ──
 * 必要なのは `id` だけ。店舗名・集金日・合計・集金者は
 *   ① 一覧（useFundList）のキャッシュから拾う
 *   ② 見つからなければクエリパラメータ
 *      （laundryName / date / totalFunds / collecter / username）
 * の順で解決する。GET /funds/:id は fundsArray しか返さない
 * （BFF の getFundItemById が select("fundsArray") のため）ので、詳細 API だけでは足りない。
 */
export default function FundDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    laundryName?: string;
    date?: string;
    totalFunds?: string;
    collecter?: string;
    username?: string;
  }>();
  const id = params.id;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isOnline } = useOutbox();

  const detail = useFundDetail(id);
  const bootstrap = useBootstrap();
  const updateDate = useUpdateFundDate(id);
  const updateData = useUpdateFundData(id);
  const deleteFund = useDeleteFund(id);

  // 一覧の結果は編集のたびに取り直されるので、毎レンダー引き直して新しいほうを使う
  const cached = id ? findFundInCache(queryClient, String(id)) : undefined;
  const laundryName = cached?.laundryName ?? orNull(params.laundryName);
  const recordDate = cached?.date ?? toNumber(params.date);
  const recordTotal = cached?.totalFunds ?? toNumber(params.totalFunds);
  const collecterId = cached?.collecter ?? orNull(params.collecter);
  const collecterName = cached?.profiles?.username ?? orNull(params.username);

  /** 保存済みの集金日。保存に成功したときだけ動かす */
  const [savedDate, setSavedDate] = useState<number | null>(recordDate);
  /** カレンダーで選択中の集金日 */
  const [dateEpoch, setDateEpoch] = useState<number | null>(recordDate);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [editing, setEditing] = useState(false);
  /** 編集中の枚数。TextInput に合わせて文字列で持つ */
  const [coinDraft, setCoinDraft] = useState<Record<string, string>>({});
  /** 明細を持たない集金データ（合計だけの登録）用の金額。単位は円 */
  const [totalDraft, setTotalDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 一覧のキャッシュが後から埋まる場合（ディープリンクなど）に一度だけ拾う。
  // 保存後に一覧が古いまま残っていても選択中の日付を巻き戻さないよう、未設定のときだけ入れる
  useEffect(() => {
    if (savedDate === null && recordDate !== null) {
      setSavedDate(recordDate);
      setDateEpoch(recordDate);
    }
  }, [recordDate, savedDate]);

  const entries: FundEntry[] = detail.data?.fundsArray ?? [];
  const hasEntries = entries.length > 0;

  /**
   * 編集中の明細。
   * ⚠️ funds は「円」ではなく硬貨の枚数。金額にするときは必ず ×100 する
   *    （本家 MachineAndFundsList.jsx の submitMachineData と同じ）。
   */
  const draftEntries: FundEntry[] = entries.map((entry) => ({
    ...entry,
    funds: toInt(coinDraft[entry.id]),
  }));

  const displayTotal = hasEntries
    ? calcTotalFunds(editing ? draftEntries : entries)
    : editing
      ? toInt(totalDraft)
      : (recordTotal ?? 0);

  const myRole = bootstrap.data?.organization?.myRole;
  const myUserId = bootstrap.data?.user.id;

  /**
   * 編集できる相手かどうかの目安。
   *
   * ⚠️ 正は必ずサーバ（updateData / updateDate / deleteData）。ここでの判定は
   *    「押しても何も起きないボタンを押させない」ためのものでしかない。
   *    サーバは viewer を 403 で弾き、admin 以外の更新には .eq("collecter", user.id) を
   *    足す（＝他人のデータは 0 行更新でエラーにならない）ので、
   *    アプリ側でも同じ条件で伏せておかないと「保存したのに変わらない」が起きる。
   */
  const isViewer = myRole === "viewer";
  const isOwnRecord = !collecterId || !myUserId || collecterId === myUserId;
  const allowedByRole = !isViewer && (myRole === "admin" || isOwnRecord);
  /** 編集・削除は Outbox の対象外なので、圏外では触らせない（対象は集金の新規登録だけ） */
  const canEdit = allowedByRole && isOnline;

  const dateDirty = dateEpoch !== null && dateEpoch !== savedDate;
  const busy = updateDate.isPending || updateData.isPending || deleteFund.isPending;

  if (detail.isLoading && !detail.data) {
    return (
      <Screen>
        <CenterMessage text="読み込み中…" />
      </Screen>
    );
  }

  if (detail.error && !detail.data) {
    return (
      <Screen>
        <CenterMessage text={errorMessage(detail.error, "集金データを取得できませんでした")} />
      </Screen>
    );
  }

  function startEdit() {
    Haptics.selectionAsync().catch(() => {});
    setCoinDraft(
      Object.fromEntries(entries.map((entry) => [entry.id, String(entry.funds ?? 0)]))
    );
    setTotalDraft(String(recordTotal ?? 0));
    setErrorMsg(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setErrorMsg(null);
  }

  /**
   * 明細（または合計）の保存。
   *
   * 合計は本家と同じ「枚数の総和 × 100」で組み立てる（MachineAndFundsList.jsx:48）。
   * 明細を持たない集金データは合計をそのまま円として送る（TotalFundsList.jsx:37 と同じで
   * fundsArray は空配列）。
   */
  function saveFunds() {
    const body = hasEntries
      ? { fundsArray: draftEntries, totalFunds: calcTotalFunds(draftEntries) }
      : { fundsArray: [], totalFunds: toInt(totalDraft) };

    // ⚠️ 触覚は toast 側が鳴らす。ここで notificationAsync を呼ぶと二重に振動する
    updateData.mutate(body, {
      onSuccess: () => {
        setEditing(false);
        setErrorMsg(null);
        toast.success("集金データを更新しました");
      },
      onError: (error) => {
        // サーバが返した日本語メッセージをそのまま出す（言い換えない）
        const message = errorMessage(error, "集金データを更新できませんでした");
        setErrorMsg(message);
        toast.error(message);
      },
    });
  }

  /** 集金日の保存。値は JST 深夜 0 時の epoch（CalendarPicker が組み立て済み） */
  function saveDate() {
    if (dateEpoch === null) return;
    const next = dateEpoch;
    updateDate.mutate(next, {
      onSuccess: () => {
        setSavedDate(next);
        setCalendarOpen(false);
        setErrorMsg(null);
        toast.success(`集金日を ${formatJstDate(next)} に変更しました`);
      },
      onError: (error) => {
        const message = errorMessage(error, "集金日を更新できませんでした");
        setErrorMsg(message);
        toast.error(message);
      },
    });
  }

  /**
   * 削除。取り返しがつかないので、何を消すのか（店舗・日付・金額）を出して確認する。
   * ⚠️ Alert.alert は react-native-web で空関数なので使わないこと（ブラウザで無反応になる）。
   */
  async function confirmDelete() {
    const store = laundryName ? `${laundryName}店` : "この集金データ";
    const day = savedDate !== null ? formatJstDate(savedDate) : "日付不明";

    const ok = await dialog.confirm({
      title: `${store}（${day}）の集金データを削除しますか？`,
      message: `合計 ¥${displayTotal.toLocaleString()} の記録が消えます。削除すると元に戻せません。`,
      confirmLabel: "削除する",
      destructive: true,
    });
    if (!ok) return;

    deleteFund.mutate(undefined, {
      onSuccess: () => {
        // 画面を閉じてからトーストを出す。ToastProvider は Stack の外側にいるので
        // 遷移しても消えない（削除できたことが一覧側で確認できる）
        router.back();
        toast.success(`${store}の集金データを削除しました`);
      },
      onError: (error) => {
        const message = errorMessage(error, "集金データを削除できませんでした");
        setErrorMsg(message);
        toast.error(message);
      },
    });
  }

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {laundryName ? `${laundryName}店` : "集金データ"}
          </Text>
          <Text style={styles.headerSub}>
            {savedDate !== null ? formatJstDate(savedDate) : "集金の詳細"}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {!isOnline && (
        <View style={styles.offlineNote}>
          <Text style={styles.offlineNoteText}>
            オフライン — 電波が戻るまで編集・削除はできません
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* 失敗の理由は言い換えずそのまま出す。何を直せばいいか分からなくなるため */}
          {errorMsg && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={color.red500} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* 押せない理由は必ず出す。黙って伏せると現場で詰まる */}
          {!allowedByRole && (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>
                {isViewer
                  ? "閲覧のみの権限のため、この集金データは編集・削除できません。"
                  : "自分が登録した集金データ以外は、管理者のみが編集・削除できます。"}
              </Text>
            </View>
          )}

          {/* ── 合計 ──（本家 MachineAndFundsList の上部ボックスと同じ「合計売上 + 台数」） */}
          <View style={styles.totalCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.totalLabel}>合計売上</Text>
              <Text style={styles.totalValue}>¥{displayTotal.toLocaleString()}</Text>
            </View>
            {hasEntries && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{entries.length}台</Text>
              </View>
            )}
          </View>

          {/* ── 集金日 ── */}
          <SectionHead icon="calendar-outline" label="集金日" />
          {savedDate === null && dateEpoch === null ? (
            <Muted>集金日を取得できませんでした。売上履歴から開き直してください。</Muted>
          ) : (
            <>
              <Pressable
                onPress={() => {
                  if (!canEdit) return;
                  Haptics.selectionAsync().catch(() => {});
                  setCalendarOpen((open) => !open);
                }}
                disabled={!canEdit}
                accessibilityRole="button"
                accessibilityState={{ expanded: calendarOpen, disabled: !canEdit }}
                style={({ pressed }) => [styles.dateValue, pressed && { opacity: 0.85 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateText}>{formatJstDateLong(dateEpoch ?? savedDate!)}</Text>
                  {canEdit && <Text style={styles.dateHint}>タップして変更</Text>}
                </View>
                {canEdit && (
                  <Ionicons
                    name={calendarOpen ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={color.teal}
                  />
                )}
              </Pressable>

              {calendarOpen && canEdit && (
                <CalendarPicker
                  value={dateEpoch ?? savedDate!}
                  onChange={(next) => setDateEpoch(next)}
                  style={{ marginTop: spacing.sm }}
                />
              )}

              {/* 選んだだけでは送らない。履歴の書き換えなので確定は明示的に押させる */}
              {dateDirty && canEdit && (
                <View style={styles.actionRow}>
                  <Button
                    label="取り消し"
                    variant="ghost"
                    onPress={() => {
                      setDateEpoch(savedDate);
                      setCalendarOpen(false);
                    }}
                    disabled={busy}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="この日付で保存"
                    variant="gradient"
                    onPress={saveDate}
                    loading={updateDate.isPending}
                    disabled={busy}
                    style={{ flex: 1.4 }}
                  />
                </View>
              )}
            </>
          )}

          <Divider />

          {/* ── 集金者 ──（本家 CoinDataCard.jsx:105 の「集金者：〜」と同じ） */}
          <View style={styles.metaRow}>
            <Ionicons name="person-circle-outline" size={18} color={color.textMuted} />
            <Text style={styles.metaText}>集金者：{collecterName ?? "不明"}</Text>
          </View>

          <Divider />

          {/* ── 明細 ── */}
          <SectionHead
            icon="hardware-chip-outline"
            label={hasEntries ? "設備ごとの集金額" : "合計金額"}
          />

          {hasEntries ? (
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={[styles.th, { flex: 1 }]}>設備</Text>
                <Text style={[styles.th, styles.right]}>売上</Text>
              </View>

              {entries.map((entry) => {
                const coins = editing ? toInt(coinDraft[entry.id]) : (entry.funds ?? 0);
                return (
                  <View key={entry.id} style={styles.tableRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.machineName}>{entry.name}</Text>
                      <Text style={styles.machineHint}>
                        {coins.toLocaleString()}枚 × {COIN_VALUE}円
                      </Text>
                    </View>

                    {editing ? (
                      <View style={styles.inputGroup}>
                        <TextInput
                          style={styles.input}
                          value={coinDraft[entry.id] ?? ""}
                          // 数字以外は弾く。本家は入力後に「数字以外の文字が含まれています」を
                          // 出すが、テンキー入力では最初から入らないようにするほうが早い
                          onChangeText={(text) =>
                            setCoinDraft((prev) => ({
                              ...prev,
                              [entry.id]: text.replace(/[^0-9]/g, ""),
                            }))
                          }
                          keyboardType="number-pad"
                          inputMode="numeric"
                          placeholder="0"
                          placeholderTextColor={color.textFaint}
                          selectTextOnFocus
                        />
                        <View style={styles.addon}>
                          <Text style={styles.addonText}>枚</Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.amount}>
                        ¥{entryAmount(entry).toLocaleString()}
                      </Text>
                    )}
                  </View>
                );
              })}

              <View style={[styles.tableRow, styles.tableFoot]}>
                <Text style={styles.footLabel}>合計</Text>
                <Text style={styles.footValue}>¥{displayTotal.toLocaleString()}</Text>
              </View>
            </View>
          ) : editing ? (
            // 明細を持たない集金データ（合計だけの登録）。単位は枚数ではなく円
            <View style={styles.inputGroup}>
              <View style={styles.addon}>
                <Text style={[styles.addonText, { fontSize: 17 }]}>¥</Text>
              </View>
              <TextInput
                style={[styles.input, styles.totalInput]}
                value={totalDraft}
                onChangeText={(text) => setTotalDraft(text.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder="合計金額を入力してください"
                placeholderTextColor={color.textFaint}
              />
            </View>
          ) : (
            <Muted>
              この集金は合計金額だけで登録されています。設備ごとの内訳はありません。
            </Muted>
          )}

          {canEdit && (
            <View style={styles.actionRow}>
              {editing ? (
                <>
                  <Button
                    label="キャンセル"
                    variant="ghost"
                    onPress={cancelEdit}
                    disabled={busy}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="保存"
                    variant="gradient"
                    onPress={saveFunds}
                    loading={updateData.isPending}
                    disabled={busy}
                    style={{ flex: 1.4 }}
                  />
                </>
              ) : (
                <Button
                  label="金額を編集"
                  icon="pencil"
                  variant="primary"
                  onPress={startEdit}
                  disabled={busy}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          )}

          {canEdit && (
            <>
              <Divider />
              <Button
                label="この集金データを削除"
                icon="trash-outline"
                variant="danger"
                onPress={confirmDelete}
                loading={deleteFund.isPending}
                disabled={busy}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SectionHead({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
}) {
  return (
    <View style={styles.sectionHead}>
      <Ionicons name={icon} size={19} color={color.teal} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

/** queryKeys.fundList(storeId) は ["funds", "list", storeId]。その前方一致で全店舗ぶんを見る */
const FUND_LIST_PREFIX = ["funds", "list"] as const;

/**
 * 一覧のキャッシュから 1 件を探す。
 * 店舗別の一覧（/stores/:id/funds）と組織全体の一覧（収益タブ）でキーが分かれているため、
 * どちらから来ても拾えるように前方一致で全部見る。取得は行わない（キャッシュのみ）。
 */
function findFundInCache(client: QueryClient, id: string): FundListItem | undefined {
  const caches = client.getQueriesData<InfiniteData<FundListItem[]>>({
    queryKey: FUND_LIST_PREFIX,
  });
  for (const [, data] of caches) {
    for (const page of data?.pages ?? []) {
      const hit = page.find((row) => String(row.id) === id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** 未指定と空文字はどちらも「無し」として扱う。Number("") は 0（＝1970 年）になるため */
function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function orNull(value: string | undefined): string | null {
  return value ? value : null;
}

function toInt(value: string | undefined): number {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** ApiError のメッセージは BFF が返した日本語なので、言い換えずそのまま見せる */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
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
    ...shadow.sm,
  },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    textAlign: "center",
    fontFamily: font.uiBold,
    fontSize: 16,
    color: color.textMain,
  },
  headerSub: {
    textAlign: "center",
    fontFamily: font.ui,
    fontSize: 11,
    color: color.textMuted,
    marginTop: 2,
  },
  offlineNote: {
    backgroundColor: color.orange500,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  offlineNoteText: { fontFamily: font.ui, fontSize: 12, color: "#FFFFFF", textAlign: "center" },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: color.red50,
    borderWidth: 1,
    borderColor: color.red400,
    borderRadius: radius.card - 6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { flex: 1, fontFamily: font.ui, fontSize: 13, color: "#991B1B" },
  noticeBox: {
    backgroundColor: color.gray50,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.card - 6,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noticeText: { fontFamily: font.ui, fontSize: 12, color: color.textMuted },

  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.cardBg,
    borderWidth: 1,
    borderColor: color.cyan100,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadow.sm,
  },
  totalLabel: { fontFamily: font.ui, fontSize: 12, color: color.textMuted, marginBottom: 2 },
  totalValue: { fontFamily: font.mono, fontSize: 30, color: color.textMain },
  badge: {
    backgroundColor: color.cyan100,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  badgeText: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionLabel: { fontFamily: font.uiBold, fontSize: 15, color: color.teal },
  divider: { height: 1, backgroundColor: color.divider, marginVertical: spacing.xl },

  dateValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.card,
    backgroundColor: color.cardBg,
    borderWidth: 1.5,
    borderColor: color.cyan200,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dateText: { fontFamily: font.mono, fontSize: 17, color: color.textMain },
  dateHint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, marginTop: 2 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metaText: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },

  table: {
    borderWidth: 1,
    borderColor: color.cyan100,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: color.cardBg,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.gray50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  th: { fontFamily: font.uiBold, fontSize: 12, color: color.textMuted },
  right: { textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  tableFoot: { backgroundColor: color.cyan50 },
  footLabel: { flex: 1, fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  footValue: { fontFamily: font.mono, fontSize: 18, color: color.teal },
  machineName: { fontFamily: font.uiBold, fontSize: 14, color: color.textMain },
  machineHint: { fontFamily: font.ui, fontSize: 11, color: color.textFaint, marginTop: 2 },
  amount: { fontFamily: font.mono, fontSize: 16, color: color.textMain },

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
    minWidth: 40,
    paddingHorizontal: spacing.md,
    backgroundColor: color.cyan100,
    alignItems: "center",
    justifyContent: "center",
  },
  addonText: { fontFamily: font.uiBold, fontSize: 14, color: color.tealDeeper },
  input: {
    minWidth: 96,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    fontFamily: font.mono,
    fontSize: 16,
    color: color.textMain,
    textAlign: "right",
  },
  /** 合計だけの集金データはテンキーが 1 つしかないので、横幅いっぱいに広げる */
  totalInput: { flex: 1, textAlign: "left", fontFamily: font.ui },

  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
});
