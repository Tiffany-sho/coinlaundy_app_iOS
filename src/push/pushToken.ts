import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { apiFetch } from "@/api/client";
import { storage } from "@/api/queryClient";

/**
 * Expo プッシュトークンの取得と BFF への登録。
 *
 * ⚠️ **Expo Go では動かない。** SDK 53 以降、iOS の Expo Go はリモートプッシュに
 *    対応しなくなった。確認には EAS の development build が要る。
 *
 * ⚠️ **起動直後に許可を求めない。** 初回の集金登録が終わった直後に
 *    アプリ内のプライミング画面を挟んでから OS ダイアログを出す（設計図 10.3）。
 *    いきなり出すと拒否率が跳ね上がり、一度拒否されると**アプリからは
 *    二度とダイアログを出せない**（設定アプリへ誘導するしかなくなる）。
 */

/** プライミングを出したか。「まだ聞いていない」と「拒否された」を区別するために持つ */
const PRIMED_KEY = "push.primed";
/** 最後に BFF へ送ったトークン。毎回 POST しないための控え */
const SYNCED_KEY = "push.syncedToken";
/** 集金を 1 回でも登録したか。プライミングを出す条件（設計図 10.3） */
const COLLECTED_KEY = "push.hasCollected";

export type PushPermission = "granted" | "denied" | "undetermined";

/**
 * プッシュが使える環境か。
 * シミュレータと web はトークンを取れないので、UI ごと出さない判断に使う。
 */
export function isPushSupported(): boolean {
  return Platform.OS !== "web" && Device.isDevice;
}

export function hasBeenPrimed(): boolean {
  return storage.getBoolean(PRIMED_KEY) ?? false;
}

export function markPrimed(): void {
  storage.set(PRIMED_KEY, true);
}

/** 集金の登録が終わったときに呼ぶ。プライミングを出す合図 */
export function markCollectRegistered(): void {
  storage.set(COLLECTED_KEY, true);
}

export function hasRegisteredCollect(): boolean {
  return storage.getBoolean(COLLECTED_KEY) ?? false;
}

export async function getPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

/**
 * OS の許可ダイアログを出す。
 * ⚠️ 一度 denied になった端末では**ダイアログが出ずに即 denied が返る**。
 *    再許可は設定アプリからしかできないので、呼び出し側でその案内を出すこと。
 */
export async function requestPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return "denied";
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted" ? "granted" : "denied";
}

/**
 * EAS のプロジェクト ID。getExpoPushTokenAsync に必須。
 *
 * ⚠️ `eas init` を実行するまで app.json に入らない。未設定のまま呼ぶと
 *    "No projectId found" で落ちるので、呼ぶ前に必ずここで確認する。
 */
function getProjectId(): string | null {
  const fromEas = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromEas === "string" && fromEas.length > 0) return fromEas;
  // 開発ビルドでは easConfig 側に入ることがある
  const fromConfig = Constants.easConfig?.projectId;
  return typeof fromConfig === "string" && fromConfig.length > 0 ? fromConfig : null;
}

export type SyncResult =
  | { ok: true; token: string }
  | { ok: false; reason: "unsupported" | "not-granted" | "no-project-id" | "failed" };

/**
 * トークンを取得して BFF に登録する。許可済みのときだけ呼ぶこと。
 *
 * 同じトークンを何度送っても害はない（サーバ側は upsert）が、毎起動で叩くのは
 * 無駄なので、前回送った値と同じならスキップする。
 */
export async function syncPushToken(): Promise<SyncResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const permission = await getPermission();
  if (permission !== "granted") return { ok: false, reason: "not-granted" };

  const projectId = getProjectId();
  if (!projectId) {
    console.warn("[push] projectId が無い。`eas init` を実行すること");
    return { ok: false, reason: "no-project-id" };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    if (storage.getString(SYNCED_KEY) === token) return { ok: true, token };

    await apiFetch("/devices", {
      method: "POST",
      body: {
        expoToken: token,
        platform: Platform.OS === "android" ? "android" : "ios",
        appVersion: Constants.expoConfig?.version ?? null,
      },
    });

    storage.set(SYNCED_KEY, token);
    return { ok: true, token };
  } catch (e) {
    // 通知が使えなくてもアプリは動く。落とさずに握る
    console.warn("[push] token sync failed", e);
    return { ok: false, reason: "failed" };
  }
}

/**
 * ログアウト時にトークンを外す。
 *
 * ⚠️ **必ずサインアウトの前に呼ぶこと。** 後に呼ぶとアクセストークンが失効していて
 *    401 になり、行が残る。残った行に通知を送ると、端末を引き継いだ別のユーザーに
 *    前の組織の集金予定が届く。
 */
export async function unregisterPushToken(): Promise<void> {
  const token = storage.getString(SYNCED_KEY);
  // 端末に控えが無くても、権限があるなら取り直して確実に消す
  const target = token ?? (await currentTokenQuietly());
  if (!target) return;

  try {
    await apiFetch("/devices", { method: "DELETE", body: { expoToken: target } });
  } catch (e) {
    console.warn("[push] token unregister failed", e);
  } finally {
    // ⚠️ react-native-mmkv v4 のキー削除は remove()。delete() は存在しない
    storage.remove(SYNCED_KEY);
  }
}

async function currentTokenQuietly(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const projectId = getProjectId();
  if (!projectId) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}
