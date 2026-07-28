import Constants from "expo-constants";
import { supabase } from "./supabase";
import type { ApiErrorCode } from "./types";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://www.collecie.com/api/v1";

const CLIENT_VERSION = `ios/${Constants.expoConfig?.version ?? "0.0.0"}`;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(message: string, status: number, code: ApiErrorCode) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** 再試行しても無駄なエラーか（Outbox がリトライ対象を判断するのに使う） */
  get isPermanent() {
    return this.status >= 400 && this.status < 500 && this.status !== 408;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** 書き込み系で必須。同じキーの再送は 1 件しか登録されない */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function send(path: string, options: RequestOptions, token: string | null) {
  /**
   * ⚠️ multipart（画像アップロード）のときは Content-Type を**付けない**。
   *    自分で書くと boundary が付かず、サーバー側の formData() が空になる。
   *    fetch に FormData を渡せば boundary 込みで組み立ててくれる。
   */
  const isMultipart = options.body instanceof FormData;

  const headers: Record<string, string> = { "X-Client-Version": CLIENT_VERSION };
  if (!isMultipart) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  return fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined
        ? undefined
        : isMultipart
          ? (options.body as FormData)
          : JSON.stringify(options.body),
    signal: options.signal,
  });
}

/**
 * BFF を叩く唯一の入口。
 *
 * - 401 を受けたら「1 回だけ」セッションを更新して再試行する。
 *   それでも駄目ならセッション切れとして ApiError を投げ、呼び出し側でログイン画面へ。
 * - 成功レスポンスは { data } なので data だけを返す。
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let token = await getAccessToken();

  let response: Response;
  try {
    response = await send(path, options, token);
  } catch {
    // ネットワーク到達不可。オフラインバナーの判定に使う
    throw new ApiError("通信できませんでした", 0, "OFFLINE");
  }

  if (response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) {
      token = data.session.access_token;
      try {
        response = await send(path, options, token);
      } catch {
        throw new ApiError("通信できませんでした", 0, "OFFLINE");
      }
    }
  }

  if (response.status === 204) return null as T;

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? "エラーが発生しました",
      response.status,
      payload?.error?.code ?? "BAD_REQUEST"
    );
  }

  return payload?.data as T;
}
