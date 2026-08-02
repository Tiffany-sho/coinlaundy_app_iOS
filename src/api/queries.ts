import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, apiFetch } from "./client";
import type {
  ActionMessage,
  ActionMessagePage,
  Announcement,
  Bootstrap,
  CollectSchedule,
  DeletionSummary,
  Expense,
  ExportFile,
  ExportFormat,
  FundDetail,
  FundEntry,
  FundListItem,
  HomeSummary,
  Invitation,
  LaundryState,
  MachineBreakdown,
  MembersResponse,
  MonthlyChartPoint,
  MonthlyPoint,
  PaymentMethodInput,
  RecurringExpense,
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
  announcements: ["announcements"] as const,
};

/**
 * 開発者からのお知らせ。組織に関係なく全ユーザー共通。
 *
 * ⚠️ 下書きと期限切れは BFF が落とすので、返ってきたものはそのまま出してよい。
 * ⚠️ 未読の判定はサーバに持たせていない（端末ごとに独立）。
 *    `src/components/settings/announcementsRead.ts` を参照。
 */
export function useAnnouncements(enabled = true) {
  return useQuery({
    queryKey: queryKeys.announcements,
    queryFn: () => apiFetch<Announcement[]>("/announcements"),
    enabled,
    // 頻繁に変わるものではないので、開くたびに取り直さない
    staleTime: 1000 * 60 * 30,
  });
}

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
  /**
   * この店舗の支払方法（現金以外）。
   *
   * ⚠️ **`images` と規約が逆。省略は「据え置き」で、空配列が「全部無効にする」。**
   *    支払方法を知らないクライアント（Web の店舗フォーム）が保存したときに
   *    全部消えないようにするため。**`?? []` を付けて送らないこと。**
   * ⚠️ `id` は送らない。サーバが**名前**で既存の行と突き合わせる
   *    （他店舗の id を送られても書き換えられないようにするため）。
   */
  paymentMethods?: PaymentMethodInput[];
};

/**
 * 店舗画像を Storage に置く。返り値は laundry_store.images の 1 要素と同じ形。
 *
 * ⚠️ これは Storage に置くだけで DB には反映されない。
 *    返ってきた { url, path } を images 配列に足して useUpdateStore / useCreateStore へ渡すこと。
 * ⚠️ 送るのは FormData。apiFetch が multipart を検知して Content-Type を外す。
 */
/**
 * 店舗画像を 1 枚アップロードする。**2 段構え**になっている。
 *
 *   ① BFF に署名付き URL を貰う（送るのは小さな JSON）
 *   ② 実体は Supabase Storage へ**直接** PUT する
 *
 * ⚠️ **実体を BFF に通してはいけない。** Vercel のサーバーレス関数はリクエスト
 *    ボディが 4.5MB を超えると**関数に届く前に**弾く。iPhone の写真は quality 0.8 でも
 *    2〜5MB になるので現実的に踏むうえ、拒否がアップロード途中の接続切断として
 *    現れるため、端末には 413 すら返らず fetch の例外（「通信できませんでした」）
 *    しか出ない。電波のせいだと誤解する。②で関数を経由しないので上限は
 *    Storage のバケット設定だけになる。
 *
 * ⚠️ **署名付き URL の有効期限は 2 時間。** 貰ってすぐ使うこと。画面を開いたときに
 *    先に取っておくような作りにしない。
 *
 * ⚠️ **Storage に置いただけでは `laundry_store.images` は変わらない。**
 *    DB への反映は店舗の PATCH に images 配列ごと送って行う（配列を省くと
 *    空配列で上書きされる）。保存に失敗したらここで置いたものを消して巻き戻す。
 */
export async function uploadStoreImage(file: {
  uri: string;
  name: string;
  type: string;
  /**
   * ⚠️ ブラウザで確認するときは必須。web の uri は `blob:http://…` で、
   *    fetch で読み直すより expo-image-picker が返す asset.file をそのまま
   *    body にしたほうが確実。
   */
  blob?: Blob;
}): Promise<StoreImage> {
  const { signedUrl, url, path } = await apiFetch<{
    signedUrl: string;
    url: string;
    path: string;
  }>("/stores/images/signed-url", {
    method: "POST",
    body: { filename: file.name, contentType: file.type },
  });

  /**
   * ⚠️ 生のバイト列で送る。FormData で送ってはいけない。
   *    署名付き URL は body が FormData だとフィールド名の解釈が実装依存になる。
   *    content-type ヘッダを付けた生ボディなら storage-js の uploadToSignedUrl と
   *    同じ経路（PUT + content-type）になる。
   *
   * native では file:// を fetch して ArrayBuffer にする（Supabase の Expo 向け
   * ドキュメントと同じやり方）。web は picker が返した File をそのまま使う。
   */
  const body = file.blob ?? (await fetch(file.uri).then((r) => r.arrayBuffer()));

  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type,
      // ⚠️ 上書きを許さない。ファイル名は時刻 + uuid で衝突しないので許す理由が無い
      "x-upsert": "false",
      "cache-control": "max-age=3600",
    },
    body,
  });

  if (!response.ok) {
    // ⚠️ Storage のエラーは { statusCode, error, message } で返る（BFF の形とは違う）
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.message ?? payload?.error ?? "";
    } catch {
      detail = "";
    }
    throw new ApiError(
      detail ? `画像のアップロードに失敗しました: ${detail}` : "画像のアップロードに失敗しました",
      response.status,
      "BAD_REQUEST"
    );
  }

  return { url, path };
}

/** Storage から 1 枚消す。DB 側の images 配列からも外して保存すること */
export function deleteStoreImage(path: string): Promise<{ path: string }> {
  return apiFetch<{ path: string }>("/stores/images", { method: "DELETE", body: { path } });
}

/**
 * アカウントのアイコンを差し替える。店舗写真と同じ 2 段構え（署名付き URL → 直接 PUT）。
 *
 * 店舗写真と違う点が 3 つある。
 *   - **ファイル名を送らない。** 保存先は `avatars/{user.id}.{ext}` とサーバが決める。
 *     ⚠️ 名前を渡せるようにすると他人のアイコンを差し替えられる
 *   - **`x-upsert: true`。** パスが固定なので 2 回目以降は必ず上書きになる
 *   - **アップロードのあと確定が要る。** `PATCH /profile { avatarExt }` を送るまで
 *     `profiles.avatar_url` は変わらない。⚠️ 先に URL を書くと、PUT が失敗したときに
 *     存在しないファイルを指すことになる
 *
 * 返るのは保存された公開 URL。⚠️ `?v=<時刻>` が付いている。パスが固定なので、
 * 付けないと URL が 1 文字も変わらず端末とブラウザのキャッシュが古い画像を出し続ける。
 */
export async function uploadAvatar(file: {
  uri: string;
  /** 正規化済みの content-type（image/jpeg | image/png） */
  type: string;
  /** ⚠️ ブラウザ確認時は必須。web の uri は blob: なので picker が返した File を使う */
  blob?: Blob;
}): Promise<{ avatarUrl: string }> {
  const { signedUrl, ext } = await apiFetch<{ signedUrl: string; ext: string }>(
    "/profile/avatar/signed-url",
    { method: "POST", body: { contentType: file.type } }
  );

  // ⚠️ 生のバイト列で送る。FormData で送ると解釈が実装依存になる（uploadStoreImage と同じ）
  const body = file.blob ?? (await fetch(file.uri).then((r) => r.arrayBuffer()));

  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type,
      // ⚠️ パスが `avatars/{user.id}.{ext}` で固定なので上書きを許すしかない
      "x-upsert": "true",
      "cache-control": "max-age=3600",
    },
    body,
  });

  if (!response.ok) {
    // ⚠️ Storage のエラーは { statusCode, error, message } で返る（BFF の形とは違う）
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.message ?? payload?.error ?? "";
    } catch {
      detail = "";
    }
    throw new ApiError(
      detail ? `アイコンのアップロードに失敗しました: ${detail}` : "アイコンのアップロードに失敗しました",
      response.status,
      "BAD_REQUEST"
    );
  }

  // ⚠️ ここまでは Storage に置いただけ。DB に反映されるのはこの 1 行
  return apiFetch<{ avatarUrl: string }>("/profile", {
    method: "PATCH",
    body: { avatarExt: ext },
  });
}

/**
 * 表示名と氏名の更新。
 *
 * ⚠️ **両方必ず送ること。** Web の `updateProfile` が
 *    `if (!fullname || !username) return { error: "空のフォームデータがあります" }` で
 *    弾くので、片方だけ送ると 400 になる。空文字も同じ扱いなのでどちらも必須入力。
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fullname: string; username: string }) =>
      apiFetch("/profile", { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
  });
}

/** アイコンの差し替え。⚠️ 成否のトーストは呼び出し側で必ず出すこと */
export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadAvatar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap }),
  });
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

/**
 * 集金一覧を offset + limit で読む。
 *
 * ⚠️ **現在どの画面からも使っていない。使う前にこの節を読むこと。**
 *
 * ⚠️ **返るのは「直近 2 か月」だけ。** BFF の `getOrgCollectFundsPaginated` /
 *    `getStoreFundsPaginated` が `startEpoch` を 2 か月前の月初に固定しているので、
 *    `offset` をいくら進めても**それより古い集金には絶対に届かない**。
 *    エラーにならず「そこで終わっている」ようにしか見えない。
 *
 * ⚠️ **合計を出す用途に使わない。** 手元にあるのは読み込み済みのページだけで、
 *    しかも上のとおり 2 か月ぶんしかない。**これで実際に 2 回壊れている**
 *    （店舗別収益の履歴が 2 か月で切れる / 店舗詳細の「総売上」が最初の 30 件の合計になる）。
 *      - 全期間の履歴  → `useFundHistory`
 *      - 店舗ごとの総額 → `useStoreRevenue`（`/funds/summary/stores`）
 */
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

/** 売上履歴の並び替え軸。値は collect_funds の列名そのもの（サーバの ORDER BY に渡る） */
export type FundOrder = "date" | "totalFunds";

/**
 * 売上履歴。**全期間ぶんをサーバに並べさせて受け取る。**
 *
 * ⚠️ 期間を区切って取らないこと。「売上が高い順」の先頭が、取ってきた期間の中の
 *    最高額でしかなくなる。並び替えは常に全データに対して効く必要がある。
 *    一度に出す件数を絞るのは受け取ったあとの話（historyRows.ts）。
 *
 * ⚠️ useFundList（offset + limit）を売上履歴に使わないこと。あちらが呼ぶ
 *    getOrgCollectFundsPaginated は startEpoch を「2 か月前の月初」に固定しており、
 *    offset をいくら進めても**それより古いデータは絶対に返ってこない**。
 *
 * ⚠️ 並び替えはサーバの ORDER BY に任せること（order / asc を渡す）。
 *    件数が増えたときにクライアントで並べ替えるのは無駄。
 */
export function useFundHistory({
  storeId,
  order,
  asc,
}: {
  storeId?: string;
  order: FundOrder;
  asc: boolean;
}) {
  return useQuery({
    queryKey: [...queryKeys.funds, "history", storeId ?? null, order, asc] as const,
    queryFn: () => {
      // from=0 かつ to 省略＝全期間（BFF の funds/route.js が開放端に対応済み）
      const params = new URLSearchParams({ from: "0", order, asc: String(asc) });
      if (storeId) params.set("storeId", storeId);
      return apiFetch<FundListItem[]>(`/funds?${params.toString()}`);
    },
    /**
     * 並び順を変えるとキーが変わる。これが無いと差し替えのたびに一覧が空になって
     * 画面が飛ぶので、前の並びを出したまま裏で取り直す。
     */
    placeholderData: keepPreviousData,
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
    /**
     * ⚠️ **`totalFunds` は「現金ぶん」。** DB に入るのは現金 + キャッシュレスの
     *    総額で、サーバ（`updateData`）が組み直す。総額を送ると二重計上になる。
     * ⚠️ **`cashless` を省略＝据え置き。** 空配列は「消す」の意味なので、
     *    `?? []` を挟まないこと。
     * ⚠️ **機器ごとに内訳を持つ集金では送らない。** `fundsArray[].cashless` が
     *    正で、サーバがそちらから集金レベルの内訳を組み直す。
     */
    mutationFn: (body: {
      fundsArray: FundEntry[];
      totalFunds: number;
      cashless?: { methodId: string; amount: number }[];
    }) => apiFetch(`/funds/${id}`, { method: "PATCH", body }),
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
/**
 * 月ごとに畳んだグラフ用データ。
 *
 * ⚠️ **1 店舗を見るときは `storeId` を渡すこと。** 省くと組織全体を集計するので、
 *    `byStore` から金額は取り出せても **`count`（集金回数）は組織全体の回数**になる。
 *    店舗別ページで「◯回」や「1 回あたり」を出すと数字がずれる。
 */
export function useMonthlyChart(
  fromEpoch: number,
  toEpoch: number,
  enabled = true,
  storeId?: string
) {
  return useQuery({
    // ⚠️ storeId もキーに入れる。入れないと全体と店舗別が同じキャッシュを共有する
    queryKey: ["funds", "chart", "month", fromEpoch, toEpoch, storeId ?? null] as const,
    queryFn: () =>
      apiFetch<MonthlyChartPoint[]>(
        `/funds/chart?from=${fromEpoch}&to=${toEpoch}&groupBy=month` +
          (storeId ? `&storeId=${encodeURIComponent(storeId)}` : "")
      ),
    enabled: enabled && toEpoch > fromEpoch,
  });
}

/**
 * 機器ごとの売上内訳。**店舗別ページ専用。**
 *
 * ⚠️ **`storeId` は必須。** 組織全体では出さない。店舗をまたぐと同じ名前
 *    （「洗濯機1」）の別の台が合算されて意味の無い数字になる。
 * ⚠️ `toEpoch` は**排他**。`useMonthlyChart` と同じ規約なので、
 *    `usePeriodPager` が渡す `monthStartEpoch(range.end + 1)` をそのまま使える。
 */
export function useMachineBreakdown(
  storeId: string,
  fromEpoch: number,
  toEpoch: number,
  enabled = true
) {
  return useQuery({
    queryKey: ["funds", "summary", "machines", storeId, fromEpoch, toEpoch] as const,
    queryFn: () =>
      apiFetch<MachineBreakdown>(
        `/funds/summary/machines?storeId=${encodeURIComponent(storeId)}` +
          `&from=${fromEpoch}&to=${toEpoch}`
      ),
    enabled: enabled && Boolean(storeId) && toEpoch > fromEpoch,
  });
}

export const expenseKeys = {
  all: ["expenses"] as const,
  list: (from: number, to: number, storeId?: string) =>
    ["expenses", "list", from, to, storeId ?? "org"] as const,
  recurring: ["expenses", "recurring"] as const,
};

/**
 * 期間の経費。**毎月の固定費を展開したものも混ざって返る。**
 *
 * ⚠️ **`toEpoch` は「含む」。** `/funds/chart` の `to` は排他なので**向きが逆**。
 *    「その月まで」を出したいときは翌月 1 日ではなく**その 1 ミリ秒前**を渡すこと。
 * ⚠️ **期間は必須。** 経費は増え続けるので、切らないとサーバ側で 1000 行の
 *    上限に当たって古い順から黙って欠ける。
 */
export function useExpenses(fromEpoch: number, toEpoch: number, storeId?: string) {
  return useQuery({
    queryKey: expenseKeys.list(fromEpoch, toEpoch, storeId),
    queryFn: () =>
      apiFetch<Expense[]>(
        `/expenses?from=${fromEpoch}&to=${toEpoch}` +
          (storeId ? `&storeId=${encodeURIComponent(storeId)}` : "")
      ),
    enabled: toEpoch >= fromEpoch,
  });
}

export type ExpenseInput = {
  storeId: string | null;
  date: number;
  amount: number;
  category: string;
  note: string | null;
};

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseInput) =>
      apiFetch<Expense>("/expenses", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseKeys.all }),
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ExpenseInput & { id: string }) =>
      apiFetch<Expense>(`/expenses/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseKeys.all }),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseKeys.all }),
  });
}

export function useRecurringExpenses(enabled = true) {
  return useQuery({
    queryKey: expenseKeys.recurring,
    queryFn: () => apiFetch<RecurringExpense[]>("/expenses/recurring"),
    enabled,
  });
}

export type RecurringInput = {
  storeId: string | null;
  name: string;
  amount: number;
  category: string;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
};

export function useCreateRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecurringInput) =>
      apiFetch<RecurringExpense>("/expenses/recurring", { method: "POST", body: input }),
    // ⚠️ 定義を変えると展開結果も変わるので、一覧のキャッシュごと落とす
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseKeys.all }),
  });
}

export function useUpdateRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: RecurringInput & { id: string }) =>
      apiFetch<RecurringExpense>(`/expenses/recurring/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseKeys.all }),
  });
}

export function useDeleteRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/expenses/recurring/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseKeys.all }),
  });
}

export function useStoreRevenue(enabled = true) {
  return useQuery({
    queryKey: queryKeys.revenueByStore,
    queryFn: () => apiFetch<StoreRevenue[]>("/funds/summary/stores"),
    enabled,
  });
}

export type ExportInput = {
  format: ExportFormat;
  /** 期間の下限。JST 深夜 0 時の epoch（ミリ秒） */
  startEpoch: number;
  /**
   * 期間の上限。
   * ⚠️ **含む側（inclusive）。** BFF が `lte` で引くので、
   *    「その月まで」を出したいときは翌月 1 日ではなくその 1 ミリ秒前を渡すこと
   *    （/funds/chart の `to` は逆に排他。取り違えると 1 か月ずれる）。
   */
  endEpoch: number;
  /** 空 = 全店舗 */
  storeIds?: string[];
  /** ⚠️ Excel のシート分割にだけ効く。CSV は常に 1 ファイル */
  splitMethod?: "period" | "store";
};

/**
 * 集金データの書き出し。⚠️ Pro プラン以上でないとサーバが 403 を返す。
 *
 * ⚠️ **キャッシュしない（useQuery ではなく useMutation）。** 押したときだけ動けばよく、
 *    応答は base64 のファイル 1 本ぶんあるので、残すと MMKV の永続キャッシュが太る。
 */
export function useExportFunds() {
  return useMutation({
    mutationFn: (body: ExportInput) =>
      apiFetch<ExportFile>("/funds/export", { method: "POST", body }),
  });
}

/** ⚠️ Web の FeedbackForm と同じ 3 種類。BFF の TYPES と綴りを揃えること */
export type FeedbackType = "bug" | "feature" | "other";

/**
 * フィードバックの送信。運営者宛にメールが 1 通飛ぶだけで、DB には残らない。
 *
 * ⚠️ **アクションログには残らない**（本人にしか関係せず、本文に要望や不満が入るため）。
 * ⚠️ 本文の長さ・エスケープはサーバ側が持つ。アプリで整形しない。
 */
export function useSendFeedback() {
  return useMutation({
    mutationFn: (body: { type: FeedbackType; description: string }) =>
      apiFetch<{ sent: boolean }>("/feedback", { method: "POST", body }),
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

/*
  ⚠️ **支払方法のクエリはもう無い。** 009 で組織ごとから**店舗ごと**に移し、
     `GET /stores` の応答に `paymentMethods` として乗せてある。
     ⚠️ **独立したフックを作り直さないこと。** 店舗と別々に取ると、
     店舗一覧を更新しても支払方法が古いまま残る組み合わせが生まれる。
     登録・編集は店舗の POST / PATCH に `paymentMethods` を載せて行う。
*/

/**
 * 店舗の有効な支払方法を並び順どおりに取り出す。
 *
 * ⚠️ **`isActive` で絞る。** 無効にしたものも応答には含まれている
 *    （店舗フォームで戻せるようにするため）。
 * ⚠️ **`paymentMethods` は `undefined` のことがある**（009 より前の応答が
 *    永続キャッシュから復元される）。`?? []` を通すこと。
 */
export function activePaymentMethods(store: Store | null | undefined) {
  return (store?.paymentMethods ?? []).filter((m) => m.isActive);
}

/**
 * 組織にある支払方法の名前を、店舗をまたいで 1 つにまとめる。
 * 収益ページの絞り込みチップに使う。
 *
 * ⚠️ **名前で束ねる。** 支払方法は店舗ごとなので、同じ「PayPay」でも
 *    店舗ごとに別の uuid になる。id で並べると同じ名前のチップが
 *    店舗の数だけ出る（サーバの `byMethod` も名前で畳んである）。
 * ⚠️ **無効にしたものは出さない。** ただし過去の集金には残っているので、
 *    「無効にすると過去のぶんも絞り込めなくなる」ことになる。
 *    無効化は「もう使わない」の意味なので、それでよい。
 */
export function paymentMethodNames(stores: Store[] | null | undefined) {
  const names = new Map<string, number>();
  for (const store of stores ?? []) {
    for (const method of store.paymentMethods ?? []) {
      if (!method.isActive) continue;
      const name = method.name.trim();
      if (!name) continue;
      // 並び順は「いちばん手前に出てくる sortOrder」に揃える
      const current = names.get(name);
      if (current === undefined || method.sortOrder < current) names.set(name, method.sortOrder);
    }
  }
  return [...names.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "ja"))
    .map(([name]) => name);
}

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

/** アクションログの 1 ページの件数 */
const ACTION_LOG_PAGE_SIZE = 30;

/**
 * アクションログ（操作履歴）。
 *
 * ⚠️ **全件を一度に取らない。** ログは操作のたびに増えるので、範囲を切らないと
 *    PostgREST の 1000 行上限に当たって古い順から黙って欠ける
 *    （docs/contracts.md の「行数の上限」）。サーバも limit を必須にしてある。
 */
export function useOrgMessages(enabled = true) {
  return useInfiniteQuery({
    queryKey: settingsKeys.messages,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiFetch<ActionMessagePage>(
        `/org/messages?offset=${pageParam}&limit=${ACTION_LOG_PAGE_SIZE}`
      ),
    // ⚠️ 件数で終端を判定しない。サーバが 1 件多く引いて hasMore を返している
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length * ACTION_LOG_PAGE_SIZE : undefined,
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
