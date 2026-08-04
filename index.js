/**
 * ⚠️ **一時的な切り分け用のエントリポイント。アプリは起動しません。**
 *    原因が分かったら **このファイルを消し、package.json の "main" を
 *    "expo-router/entry" に戻すこと。**
 *
 * production ビルドだけが起動直後に落ちる（JS のエラーで
 * `reportFatalException` → `abort()`）。エラー文を捕まえる試みは
 * 3 回とも失敗した:
 *
 *   1. app/_layout.tsx の先頭で ErrorUtils.setGlobalHandler
 *      → _layout に着く前に投げられていて間に合わない
 *   2. index.js（エントリ）へ移動
 *      → それでも捕まらない
 *   3. 落ちているスレッドを確認
 *      → com.meta.react.turbomodulemanager.queue。JS が
 *        reportFatalException を呼んでいるが、RN はレンダラ内部からも
 *        これを呼ぶので ErrorUtils では網羅できない
 *
 * そこで**捕まえるのをやめ、モジュールを 1 つずつ読み込んで結果を画面に出す。**
 * どれが投げるかが 1 回のビルドで分かる。
 *
 * ⚠️ **`@/` のエイリアスを使わない**（このファイルは babel の alias 設定の
 *    外にある可能性があるため、相対パスで書く）。
 * ⚠️ **重い順ではなく依存の浅い順に並べる。** 先に落ちたものが原因で、
 *    後ろは巻き添えの可能性がある。
 */
import React from "react";
import { registerRootComponent } from "expo";
import { ScrollView, Text, View } from "react-native";

/** [状態, 名前, メッセージ] */
const results = [];

function step(name, load) {
  try {
    load();
    results.push(["OK", name, ""]);
  } catch (error) {
    const message = String((error && error.message) || error || "（メッセージなし）");
    const stack = String((error && error.stack) || "")
      .split("\n")
      .slice(0, 3)
      .join(" / ");
    results.push(["NG", name, message + (stack ? "\n" + stack : "")]);
  }
}

// ── ネイティブモジュール（浅い順）──────────────────────────────
step("expo-constants", () => require("expo-constants"));
step("expo-secure-store", () => require("expo-secure-store"));
step("expo-font", () => require("expo-font"));
step("expo-splash-screen", () => require("expo-splash-screen"));
step("expo-device", () => require("expo-device"));
step("expo-notifications", () => require("expo-notifications"));
step("expo-iap", () => require("expo-iap"));
step("expo-apple-authentication", () => require("expo-apple-authentication"));
step("expo-image", () => require("expo-image"));
step("expo-image-picker", () => require("expo-image-picker"));
step("expo-file-system", () => require("expo-file-system"));
step("expo-linear-gradient", () => require("expo-linear-gradient"));
step("expo-haptics", () => require("expo-haptics"));
step("react-native-mmkv", () => require("react-native-mmkv"));
step("react-native-safe-area-context", () => require("react-native-safe-area-context"));
step("react-native-screens", () => require("react-native-screens"));
step("react-native-gesture-handler", () => require("react-native-gesture-handler"));
step("@react-native-community/netinfo", () => require("@react-native-community/netinfo"));
step("@shopify/flash-list", () => require("@shopify/flash-list"));
step("@expo/vector-icons", () => require("@expo/vector-icons"));

// ── アプリのモジュール（module スコープで副作用のあるもの）──────
step("src/api/queryClient", () => require("./src/api/queryClient"));
step("src/api/supabase", () => require("./src/api/supabase"));
step("src/api/client", () => require("./src/api/client"));
step("src/auth/AuthProvider", () => require("./src/auth/AuthProvider"));
step("src/push/PushProvider", () => require("./src/push/PushProvider"));
step("src/offline/OutboxProvider", () => require("./src/offline/OutboxProvider"));
step("src/theme/tokens", () => require("./src/theme/tokens"));

// ── ルーティング（いちばん重いので最後）────────────────────────
step("expo-router", () => require("expo-router"));
step("app/_layout", () => require("./app/_layout"));

const ng = results.filter((r) => r[0] === "NG");

function Report() {
  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF", paddingTop: 64, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 4 }}>
        起動時の読み込み結果
      </Text>
      <Text style={{ fontSize: 13, color: ng.length ? "#B91C1C" : "#047857", marginBottom: 12 }}>
        {ng.length ? `失敗 ${ng.length} 件` : "すべて成功（module スコープでは投げていない）"}
      </Text>
      <ScrollView>
        {results.map(([state, name, message]) => (
          <View key={name} style={{ marginBottom: 8 }}>
            <Text
              selectable
              style={{ fontSize: 13, color: state === "NG" ? "#B91C1C" : "#334155" }}
            >
              {state === "NG" ? "NG  " : "ok  "}
              {name}
            </Text>
            {message ? (
              <Text selectable style={{ fontSize: 11, color: "#B91C1C", marginLeft: 24 }}>
                {message}
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

registerRootComponent(Report);
