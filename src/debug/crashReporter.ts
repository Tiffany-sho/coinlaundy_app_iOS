/**
 * ⚠️ **一時的な診断コード。原因が分かったら必ず消すこと。**
 *
 * production ビルドが起動直後に落ちる（`RCTExceptionsManager reportFatal:` → `abort()`）
 * のに、開発ビルド + `--no-dev --minify` では再現しないため、**エラーの本文を
 * 端末で読めるようにする**ためだけに置いている。
 *
 * ⚠️ **RN の既定のグローバルハンドラを呼ばない。** 呼ぶと `RCTFatal` が走って
 *    `abort()` し、**メッセージごとプロセスが消える**（今まさにそれが起きている）。
 *    ここで握り潰すと、落ちる代わりに内容を出せる。
 *
 * ⚠️ **`__DEV__` では入れない。** 開発中は赤い画面（LogBox）のほうが情報量が多く、
 *    ここで奪うと普段のデバッグが劣化する。
 *
 * ⚠️ **`app/_layout.tsx` のいちばん上で import すること。** import は書いた順に
 *    評価されるので、`queryClient`（MMKV）や `supabase`（createClient）より先に
 *    仕掛けを入れないと、**それらの module スコープで投げられた例外を捕まえられない。**
 */
import { Alert } from "react-native";

export type CapturedError = {
  message: string;
  stack: string;
  fatal: boolean;
};

let captured: CapturedError | null = null;

/** 捕まえた起動時エラー。無ければ null */
export function getCapturedError(): CapturedError | null {
  return captured;
}

const globals = globalThis as unknown as {
  ErrorUtils?: {
    setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
  };
};

if (!__DEV__ && globals.ErrorUtils?.setGlobalHandler) {
  globals.ErrorUtils.setGlobalHandler((error, isFatal) => {
    const err = error as { message?: unknown; stack?: unknown } | undefined;
    const message = String(err?.message ?? error ?? "（メッセージなし）");
    // スタックは長いので先頭だけ。minify 済みなので関数名は短いが、
    // どのファイル由来かは分かる
    const stack = String(err?.stack ?? "")
      .split("\n")
      .slice(0, 8)
      .join("\n");

    captured = { message, stack, fatal: Boolean(isFatal) };

    // ⚠️ ブリッジが立っていれば出る。立っていなければ黙って失敗するので、
    //    そのときは _layout 側の表示に賭ける（両方用意しておく）
    try {
      Alert.alert(isFatal ? "起動時エラー（致命的）" : "起動時エラー", `${message}\n\n${stack}`);
    } catch {
      // ここで投げると元のエラーが隠れるので握り潰す
    }
  });
}
