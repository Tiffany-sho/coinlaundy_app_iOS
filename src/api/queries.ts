import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type {
  ActionMessage,
  Bootstrap,
  CollectSchedule,
  DeletionSummary,
  FundDetail,
  FundEntry,
  FundListItem,
  HomeSummary,
  Invitation,
  LaundryState,
  MembersResponse,
  MonthlyChartPoint,
  MonthlyPoint,
  Role,
  Store,
  StoreImage,
  StoreRevenue,
} from "./types";

const PAGE_SIZE = 30;

export const queryKeys = {
  bootstrap: ["bootstrap"] as const,
  home: ["home"] as const,
  stores: ["stores"] as const,
  store: (id: string) => ["stores", id] as const,
  funds: ["funds"] as const,
  fundList: (storeId?: string) => ["funds", "list", storeId ?? "org"] as const,
  fundDetail: (id: string) => ["funds", "detail", id] as const,
  revenueByStore: ["funds", "summary", "stores"] as const,
  states: ["states"] as const,
};

export function useBootstrap(enabled = true) {
  return useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: () => apiFetch<Bootstrap>("/bootstrap"),
    enabled,
  });
}

export function useHome(enabled = true) {
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: () => apiFetch<HomeSummary>("/home"),
    enabled,
  });
}

export function useStores(enabled = true) {
  return useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => apiFetch<Store[]>("/stores"),
    enabled,
  });
}

export function useStore(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.store(id ?? ""),
    queryFn: () => apiFetch<Store>(`/stores/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * 店舗の登録・編集で送る内容。
 *
 * ⚠️ images は**必ず現在の配列をまるごと送ること**。省略すると空配列で上書きされ、
 *    登録済みの画像が消える（updateStore が images を必ず update に含めるため）。
 *    画像そのものの追加・削除は先に /stores/images へ行い、その結果を含めた配列を送る。
 */
export type StoreInput = {
  store: string;
  location?: string;
  description?: string;
  machines?: { id: string; name: string }[];
  images?: StoreImage[];
};

/**
 * 店舗画像を Storage に置く。返り値は laundry_store.images の 1 要素と同じ形。
 *
 * ⚠️ これは Storage に置くだけで DB には反映されない。
 *    返ってきた { url, path } を images 配列に足して useUpdateStore / useCreateStore へ渡すこと。
 * ⚠️ 送るのは FormData。apiFetch が multipart を検知して Content-Type を外す。
 */
export function uploadStoreImage(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<StoreImage> {
  const form = new FormData();
  // React Native の FormData はファイルを { uri, name, type } で受け取る（Blob 化は不要）
  form.append("file", file as unknown as Blob, file.name);
  form.append("filename", file.name);
  return apiFetch<StoreImage>("/stores/images", { method: "POST", body: form });
}

/** Storage から 1 枚消す。DB 側の images 配列からも外して保存すること */
export function deleteStoreImage(path: string): Promise<{ path: string }> {
  return apiFetch<{ path: string }>("/stores/images", { method: "DELETE", body: { path } });
}

export function useCreateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StoreInput) => apiFetch<{ id: string }>("/stores", { method: "POST", body }),
    onSuccess: () => invalidateStores(queryClient),
  });
}

export function useUpdateStore(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StoreInput) => apiFetch(`/stores/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      invalidateStores(queryClient);
      queryClient.invalidateQueries({ queryKey: queryKeys.store(id) });
    },
  });
}

/** ⚠️ 集金データ・在庫状況ごと消える。呼ぶ前に必ず確認ダイアログを出すこと */
export function useDeleteStore(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/stores/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateStores(queryClient),
  });
}

/** 店舗をいじると在庫・設備・集計・ホームの数字が全部変わる */
function invalidateStores(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.stores });
  queryClient.invalidateQueries({ queryKey: queryKeys.states });
  queryClient.invalidateQueries({ queryKey: queryKeys.funds });
  queryClient.invalidateQueries({ queryKey: queryKeys.home });
  // 店舗数が変わるとプラン情報も変わる
  queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
}

/** 売上履歴。件数が多くなるので無限スクロールで読む */
export function useFundList(storeId?: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.fundList(storeId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        offset: String(pageParam),
        limit: String(PAGE_SIZE),
        order: "date",
        asc: "false",
      });
      if (storeId) params.set("storeId", storeId);
      return apiFetch<FundListItem[]>(`/funds?${params.toString()}`);
    },
    // 満たない場合は最終ページ
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
  });
}

/**
 * 集金 1 件の詳細。一覧は明細（fundsArray）を含まないので、開いたときに取り直す。
 * ⚠️ 明細の形は Web の collect_funds.fundsArray と同じ。型は使う側で絞ること。
 */
export function useFundDetail(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.fundDetail(id ?? ""),
    queryFn: () => apiFetch<FundDetail>(`/funds/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * 集金日の変更。
 * ⚠️ date は JST 深夜 0 時の epoch（ミリ秒）。src/shared/date.ts で組み立てること。
 */
export function useUpdateFundDate(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date: number) =>
      apiFetch(`/funds/${id}`, { method: "PATCH", body: { date } }),
    onSuccess: () => invalidateFunds(queryClient, id),
  });
}

/** 明細と合計の変更。合計は明細の合計と一致させて送ること */
export function useUpdateFundData(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { fundsArray: FundEntry[]; totalFunds: number }) =>
      apiFetch(`/funds/${id}`, { method: "PATCH", body }),
    onSuccess: () => invalidateFunds(queryClient, id),
  });
}

export function useDeleteFund(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/funds/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateFunds(queryClient, id),
  });
}

/** 集金データを触ったら、一覧・集計・ホームの数字がまとめてずれるので全部落とす */
function invalidateFunds(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.funds });
  queryClient.invalidateQueries({ queryKey: queryKeys.fundDetail(id) });
  queryClient.invalidateQueries({ queryKey: queryKeys.home });
}

/** 月次推移グラフ用。storeId 未指定なら組織全体 */
export function useMonthlySummary(storeId?: string, enabled = true) {
  return useQuery({
    queryKey: ["funds", "summary", "monthly", storeId ?? "org"] as const,
    queryFn: () =>
      apiFetch<MonthlyPoint[]>(
        `/funds/summary/monthly${storeId ? `?storeId=${storeId}` : ""}`
      ),
    enabled,
  });
}

/**
 * 任意期間の月次。開始月と終了月を指定して使う。
 *
 * ⚠️ 引数は「その月の 1 日」の JST epoch。`to` は**排他**なので、終了月を含めたい場合は
 *    翌月 1 日を渡すこと（BFF が `lt` で切っている）。組み立てには
 *    src/shared/date.ts の getEpochTimeInSeconds() を使い、自前で計算しないこと。
 *
 * useMonthlySummary()（過去 2 年固定）と違い期間の制限がない。
 * 店舗ごとの内訳（byStore）も一緒に返るので、積み上げグラフのために
 * 店舗数ぶんリクエストを投げる必要はない。
 */
export function useMonthlyChart(fromEpoch: number, toEpoch: number, enabled = true) {
  return useQuery({
    queryKey: ["funds", "chart", "month", fromEpoch, toEpoch] as const,
    queryFn: () =>
      apiFetch<MonthlyChartPoint[]>(
        `/funds/chart?from=${fromEpoch}&to=${toEpoch}&groupBy=month`
      ),
    enabled: enabled && toEpoch > fromEpoch,
  });
}

export function useStoreRevenue(enabled = true) {
  return useQuery({
    queryKey: queryKeys.revenueByStore,
    queryFn: () => apiFetch<StoreRevenue[]>("/funds/summary/stores"),
    enabled,
  });
}

export function useLaundryStates(enabled = true) {
  return useQuery({
    queryKey: queryKeys.states,
    queryFn: () => apiFetch<LaundryState[]>("/states"),
    enabled,
  });
}

/**
 * 在庫の更新。
 * ⚠️ Outbox の対象外（設計図 9.3）。last-write-wins で他メンバーの更新を
 * 巻き戻すリスクがあるため、オフライン時はボタン自体を無効化する。
 */
export function useUpdateStock(laundryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<LaundryState>) =>
      apiFetch(`/states/${laundryId}/stock`, { method: "PATCH", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.states });
      queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
  });
}

/** 設備の故障状況の更新。こちらも Outbox 対象外 */
export function useUpdateMachines(laundryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (machines: LaundryState["machines"]) =>
      apiFetch(`/states/${laundryId}/machines`, { method: "PATCH", body: { machines } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.states });
      queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
  });
}

/**
 * 集金方式の既定値。profiles.collectMethod に入る値は 3 通りある。
 *   "machines" … 次回も機械別集金を使う
 *   "total"    … 次回もまとめて集金を使う
 *   null       … 固定しない（集金画面で毎回選ぶ）
 *
 * ⚠️ Web の useCollectMethod.js と同じ意味づけ。片方だけ変えないこと。
 */
export function useSetCollectMethod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectMethod: "machines" | "total" | null) =>
      apiFetch("/profile", { method: "PATCH", body: { collectMethod } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
  });
}

// ─── Phase 3: 組織・アカウント ────────────────────────────────

export const settingsKeys = {
  members: ["org", "members"] as const,
  invitations: ["org", "invitations"] as const,
  schedule: ["org", "collect-schedule"] as const,
  joinPassword: ["org", "join-password"] as const,
  messages: ["org", "messages"] as const,
  deletionSummary: ["account", "deletion-summary"] as const,
};

export function useMembers(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.members,
    queryFn: () => apiFetch<MembersResponse>("/org/members"),
    enabled,
  });
}

export function useInvitations(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.invitations,
    queryFn: () => apiFetch<Invitation[]>("/org/invitations"),
    enabled,
  });
}

/** 組織参加パスワード。admin 以外は 403 になるので enabled で止めること */
export function useJoinPassword(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.joinPassword,
    queryFn: () => apiFetch<string | null>("/org/join-password"),
    enabled,
  });
}

export function useSetJoinPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    // 空文字を送ると削除になる（Web の「空欄で保存すると削除」と同じ）
    mutationFn: (password: string) =>
      apiFetch("/org/join-password", { method: "PUT", body: { password } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.joinPassword }),
  });
}

export function useCollectSchedule(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.schedule,
    queryFn: () => apiFetch<CollectSchedule | null>("/org/collect-schedule"),
    enabled,
  });
}

export function useUpdateCollectSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (schedule: CollectSchedule | null) =>
      apiFetch("/org/collect-schedule", { method: "PUT", body: { schedule } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.schedule });
      // ホームのカウントダウンも変わるので取り直す
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      apiFetch(`/org/members/${userId}`, { method: "PATCH", body: { role } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.members }),
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiFetch(`/org/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.members }),
  });
}

/** 組織名の変更。名前はホームの bootstrap にも出るので両方取り直す */
export function useUpdateOrgName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiFetch("/org", { method: "PATCH", body: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      queryClient.invalidateQueries({ queryKey: settingsKeys.members });
    },
  });
}

/**
 * メンバー招待。Web は招待レコードの作成とメール送信を 2 回に分けて呼ぶが、
 * アプリからは BFF の 1 リクエストで両方行う（/api/invite は Cookie 前提のため）。
 */
export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: Role }) =>
      apiFetch<{ token: string; emailSent: boolean }>("/org/invitations", {
        method: "POST",
        body: { email, role },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.invitations }),
  });
}

export function useDeleteInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/org/invitations/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.invitations }),
  });
}

export function useOrgMessages(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.messages,
    queryFn: () => apiFetch<ActionMessage[]>("/org/messages"),
    enabled,
  });
}

/** 削除前に提示する影響範囲。削除画面を開いたときだけ取る */
export function useDeletionSummary(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.deletionSummary,
    queryFn: () => apiFetch<DeletionSummary>("/account"),
    enabled,
    staleTime: 0,
  });
}
