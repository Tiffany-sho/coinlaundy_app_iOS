import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  activePaymentMethods,
  useBootstrap,
  useDeleteFund,
  useFundDetail,
  useStore,
  useUpdateFundData,
  useUpdateFundDate,
} from "@/api/queries";
import {
  errorMessage,
  findFundInCache,
  orNull,
  toInt,
  toNumber,
} from "@/components/funds/fundCache";
import {
  FundDetailHeader,
  FundErrorBox,
  FundPermissionNote,
  FundTotalCard,
} from "@/components/funds/FundDetailHeader";
import { FundDateSection } from "@/components/funds/FundDateSection";
import { FundEntriesTable, FundTotalOnlyInput } from "@/components/funds/FundEntriesTable";
import {
  buildMethodRows,
  FundCashlessSection,
} from "@/components/funds/FundCashlessSection";
import { Button, CenterMessage, Screen } from "@/components/common/ui";
import { Divider, SectionHead } from "@/components/common/section";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { useOutbox } from "@/offline/OutboxProvider";
import { calcDisplayTotal, calcTotalFunds } from "@/shared/collectMoney";
import { formatJstDate } from "@/shared/date";
import { color, font, spacing } from "@/theme/tokens";
import type { FundEntry } from "@/api/types";

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
 *   ① 一覧のキャッシュから拾う（components/funds/fundCache.ts）
 *   ② 見つからなければクエリパラメータ
 *      （laundryName / date / totalFunds / collecter / username）
 * の順で解決する。GET /funds/:id は fundsArray しか返さないので詳細 API だけでは足りない。
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
  const [editing, setEditing] = useState(false);
  /** 編集中の枚数。TextInput に合わせて文字列で持つ */
  const [coinDraft, setCoinDraft] = useState<Record<string, string>>({});
  /**
   * 明細を持たない集金データ（合計だけの登録）用の金額。単位は円。
   * ⚠️ **入れるのは「現金ぶん」。** レコードの `totalFunds` は
   *    現金 + キャッシュレスの総額なので、そのまま入れて保存すると
   *    サーバがキャッシュレスを**もう一度足して二重計上**になる。
   */
  const [totalDraft, setTotalDraft] = useState("");
  /** 集金レベルの編集中キャッシュレス。methodId → 数字だけの文字列 */
  const [cashlessDraft, setCashlessDraft] = useState<Record<string, string>>({});
  /** 機器ごとの編集中キャッシュレス。entryId → methodId → 数字だけの文字列 */
  const [entryCashlessDraft, setEntryCashlessDraft] = useState<
    Record<string, Record<string, string>>
  >({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /**
   * 一覧のキャッシュが後から埋まる場合（ディープリンクなど）に一度だけ拾う。
   * ⚠️ 未設定のときだけ入れること。保存後に一覧が古いまま残っていても日付を巻き戻さないため。
   */
  if (savedDate === null && recordDate !== null) setSavedDate(recordDate);

  const entries: FundEntry[] = detail.data?.fundsArray ?? [];
  const hasEntries = entries.length > 0;

  /** この集金の合計キャッシュレス。⚠️ 古い応答では undefined */
  const recordedCashless = detail.data?.cashless ?? [];
  const recordedCashlessSum = recordedCashless.reduce((sum, e) => sum + (e.amount ?? 0), 0);

  /* 編集欄に並べる支払方法。⚠️ 記録にあるものは使用停止でも並べる（0 に戻せなくなる） */
  const store = useStore(detail.data?.laundryId ?? undefined);
  const methodRows = buildMethodRows(recordedCashless, activePaymentMethods(store.data));

  /*
    ⚠️ **記録の形をそのまま保つ。** キャッシュレスの置き場所は 2 通りある。

      機器ごと（機種別入力）      … fundsArray[].cashless が正
      集金レベル（合計入力・007） … cashless 列が正

    編集で形を変えると、サーバが「機器ぶんが正」と判断して**集金レベルの
    内訳を空で上書きし、キャッシュレスの金額が消える。**
    そこで「設備の明細があり、かつ 007 型でない」ときだけ機器ごとに編集する。
    ⚠️ **設備の明細があってキャッシュレスがまだ無い集金も機器ごと側。**
       新しく入れるぶんは機器に紐づくのが自然で、登録画面ともそろう。
  */
  const hasMachineCashless = entries.some((e) => Array.isArray(e.cashless) && e.cashless.length > 0);
  const isLegacyCashless = !hasMachineCashless && recordedCashless.length > 0;
  const perMachineMode = hasEntries && !isLegacyCashless;

  /**
   * 編集中の明細。
   * ⚠️ funds は「円」ではなく硬貨の枚数。金額にするときは必ず ×100 する
   *    （本家 MachineAndFundsList.jsx の submitMachineData と同じ）。
   */
  const draftEntries: FundEntry[] = entries.map((entry) => {
    const base = { ...entry, funds: toInt(coinDraft[entry.id]) };
    if (!perMachineMode) return base;
    const amounts = entryCashlessDraft[entry.id] ?? {};
    /*
      ⚠️ **キーは必ず載せる（空配列でも）。** サーバは `cashless` キーの有無で
         「機器ごとの入力がある集金か」を判断し、無い行は既存の内訳を
         引き継ぐ。0 件にしたつもりが元に戻る、という形で効いてくる。
    */
    return {
      ...base,
      cashless: methodRows
        .map((method) => ({
          methodId: method.methodId,
          name: method.name,
          amount: toInt(amounts[method.methodId]),
        }))
        .filter((item) => item.amount > 0),
    };
  });

  /** 集金レベルの編集中キャッシュレス。⚠️ 0 円は落とす（サーバも同じ扱い） */
  const draftCashless = methodRows
    .map((method) => ({ methodId: method.methodId, amount: toInt(cashlessDraft[method.methodId]) }))
    .filter((entry) => entry.amount > 0);
  const draftCashlessSum = draftCashless.reduce((sum, e) => sum + e.amount, 0);

  /*
    ⚠️ **`calcDisplayTotal` を使う（`calcTotalFunds` ではない）。**
       あちらは現金しか数えないので、機器ごとのキャッシュレスがある集金では
       **編集中だけ金額がその分減って見え、保存すると戻る**という挙動になる。
       サーバへ送るのは現金ぶん（`calcTotalFunds`）のまま。
  */
  const displayTotal = hasEntries
    ? calcDisplayTotal(editing ? draftEntries : entries) +
      // 007 時代の記録は集金レベルにしか内訳が無いので、そちらを足す
      (perMachineMode ? 0 : editing ? draftCashlessSum : recordedCashlessSum)
    : editing
      ? toInt(totalDraft) + draftCashlessSum
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
    setCoinDraft(Object.fromEntries(entries.map((e) => [e.id, String(e.funds ?? 0)])));
    /*
      ⚠️ **キャッシュレスを引いた「現金ぶん」を入れる。** `recordTotal` は
         現金 + キャッシュレスの総額なので、そのまま入れて保存すると
         サーバがキャッシュレスを足し直して**総額がその分だけ増える。**
         2026-08-02 まで実際にそうなっていた。
    */
    setTotalDraft(String(Math.max(0, (recordTotal ?? 0) - recordedCashlessSum)));
    setCashlessDraft(
      Object.fromEntries(
        recordedCashless.map((entry) => [String(entry.methodId), String(entry.amount ?? 0)])
      )
    );
    setEntryCashlessDraft(
      Object.fromEntries(
        entries.map((entry) => [
          entry.id,
          Object.fromEntries(
            (entry.cashless ?? []).map((item) => [String(item.methodId), String(item.amount ?? 0)])
          ),
        ])
      )
    );
    setErrorMsg(null);
    setEditing(true);
  }

  /**
   * 明細（または合計）の保存。
   *
   * 合計は本家と同じ「枚数の総和 × 100」で組み立てる（MachineAndFundsList.jsx:48）。
   * 明細を持たない集金データは合計をそのまま円として送る（fundsArray は空配列）。
   */
  /**
   * 明細（または合計）の保存。
   *
   * ⚠️ **`cashless` を送るのは「機器ごとに持たない集金」のときだけ。**
   *    機器ごとに持つ集金では `fundsArray[].cashless` が正で、サーバはそちらから
   *    集金レベルの内訳を組み直す。両方送っても機器の側が勝つが、
   *    **形を混ぜると読む人が取り違える**ので送らない。
   * ⚠️ **`totalFunds` は現金ぶん。** サーバが総額を組み直す。
   */
  function saveFunds() {
    const body = hasEntries
      ? {
          fundsArray: draftEntries,
          totalFunds: calcTotalFunds(draftEntries),
          ...(perMachineMode ? {} : { cashless: draftCashless }),
        }
      : { fundsArray: [], totalFunds: toInt(totalDraft), cashless: draftCashless };

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

  function saveDate(next: number) {
    updateDate.mutate(next, {
      onSuccess: () => {
        setSavedDate(next);
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
      <FundDetailHeader
        laundryName={laundryName}
        savedDate={savedDate}
        topInset={insets.top}
        isOnline={isOnline}
        onBack={() => router.back()}
      />

      {/*
        ⚠️ keyboardVerticalOffset を渡さないこと。上の FundDetailHeader は同じ親の中の
        RN の子で、その高さは KeyboardAvoidingView の frame.y に既に入っている。渡すと
        二重に数えてキーボードとの間に余白が出る。理由の詳細は app/collect/[storeId].tsx
      */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {errorMsg && <FundErrorBox message={errorMsg} />}
          {!allowedByRole && <FundPermissionNote isViewer={isViewer} />}

          <FundTotalCard total={displayTotal} machineCount={hasEntries ? entries.length : 0} />

          <SectionHead icon="calendar-outline" label="集金日" />
          <FundDateSection
            savedDate={savedDate}
            canEdit={canEdit}
            saving={updateDate.isPending}
            busy={busy}
            onSave={saveDate}
          />

          <Divider />

          {/* 集金者。本家 CoinDataCard.jsx:105 の「集金者：〜」と同じ */}
          <View style={styles.metaRow}>
            <Ionicons name="person-circle-outline" size={18} color={color.textMuted} />
            <Text style={styles.metaText}>集金者：{collecterName ?? "不明"}</Text>
          </View>

          <Divider />

          <SectionHead
            icon="hardware-chip-outline"
            label={hasEntries ? "設備ごとの集金額" : "合計金額"}
          />

          {hasEntries ? (
            <FundEntriesTable
              entries={entries}
              editing={editing}
              coinDraft={coinDraft}
              onCoinChange={(entryId, digits) =>
                setCoinDraft((prev) => ({ ...prev, [entryId]: digits }))
              }
              /*
                ⚠️ **007 時代の記録では空を渡す。** 機器の行に欄を出すと、
                   保存時にサーバが「機器ぶんが正」と判断して**集金レベルの
                   内訳を空で上書きし、キャッシュレスの金額が消える。**
              */
              methods={perMachineMode ? methodRows : []}
              cashlessDraft={entryCashlessDraft}
              onCashlessChange={(entryId, methodId, digits) =>
                setEntryCashlessDraft((prev) => ({
                  ...prev,
                  [entryId]: { ...(prev[entryId] ?? {}), [methodId]: digits },
                }))
              }
              displayTotal={displayTotal}
            />
          ) : (
            <FundTotalOnlyInput editing={editing} value={totalDraft} onChange={setTotalDraft} />
          )}

          {/*
            集金レベルのキャッシュレスの内訳。
            ⚠️ **機器ごとに扱う集金では出さない。** そちらは設備ごとの行に
               入力欄があり、ここにも出すと同じ金額を 2 か所に入れられてしまう。
            ⚠️ **記録が空でも編集中は出す。** あとからキャッシュレスを足せるようにするため。
          */}
          {!perMachineMode && (editing || recordedCashless.length > 0) && (
            <>
              <Divider />
              <SectionHead icon="card-outline" label="現金以外の内訳" />
              <FundCashlessSection
                methods={methodRows}
                recorded={recordedCashless}
                editing={editing}
                draft={cashlessDraft}
                onChange={(methodId, digits) =>
                  setCashlessDraft((prev) => ({ ...prev, [methodId]: digits }))
                }
              />
            </>
          )}

          {canEdit && (
            <View style={styles.actionRow}>
              {editing ? (
                <>
                  <Button
                    label="キャンセル"
                    variant="ghost"
                    onPress={() => {
                      setEditing(false);
                      setErrorMsg(null);
                    }}
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

const styles = StyleSheet.create({
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  metaText: { fontFamily: font.ui, fontSize: 13, color: color.textMuted },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
});
