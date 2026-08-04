// ⚠️ **この import を動かさない。必ず最上段。** import は書いた順に評価されるので、
//    ここより下の queryClient（MMKV）や supabase（createClient）が module スコープで
//    投げた例外を捕まえるには、先にハンドラを入れておく必要がある。
//    ⚠️ **一時的な診断コード。原因が分かったら import ごと消すこと。**
import { getCapturedError, subscribeCapturedError } from "@/debug/crashReporter";
import { useEffect, useSyncExternalStore } from "react";
import { Stack } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
// ⚠️ パッケージ直下（"@expo-google-fonts/noto-sans-jp"）から import しない。
//    index.js が全ウェイトを require するので、使わない 9 種類の ttf まで
//    バンドルに入る（Noto Sans JP だけで 48MB）。必ずウェイト単位のサブパスで取る。
import { NotoSansJP_400Regular } from "@expo-google-fonts/noto-sans-jp/400Regular";
import { NotoSansJP_700Bold } from "@expo-google-fonts/noto-sans-jp/700Bold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { queryClient, mmkvPersister } from "@/api/queryClient";
import { AuthProvider } from "@/auth/AuthProvider";
import { PushProvider } from "@/push/PushProvider";
import { OutboxProvider } from "@/offline/OutboxProvider";
import { DialogProvider } from "@/components/common/dialog";
import { ToastProvider } from "@/components/common/toast";
import { color } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  /*
    ⚠️ **一時的な診断コード。原因が分かったらこのブロックごと消すこと。**
       Alert が出せない段階で捕まえた例外は、ここで画面に出す。
       ⚠️ フックより前に return しない（フックの数が変わるとエラーになる）ので、
          描画の直前で見る。
  */
  const startupError = useSyncExternalStore(
    subscribeCapturedError,
    getCapturedError,
    getCapturedError
  );

  // 日本語フォントは容量が大きいので Regular / Bold の 2 ウェイトのみ
  const [fontsLoaded, fontError] = useFonts({
    NotoSansJP_400Regular,
    NotoSansJP_700Bold,
    Inter_700Bold, // 金額・数値。日本語グリフは持たないので font.ui と混ぜない
  });

  useEffect(() => {
    // フォントの読み込みに失敗しても起動は止めない（システムフォントで出す）
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // ⚠️ 一時的な診断コード。原因が分かったらこの if ごと消すこと
  if (startupError) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FFFFFF", paddingTop: 80, paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>起動時エラー</Text>
        <ScrollView>
          <Text selectable style={{ fontSize: 14, marginBottom: 16 }}>
            {startupError.message}
          </Text>
          <Text selectable style={{ fontSize: 11, color: "#555" }}>
            {startupError.stack}
          </Text>
        </ScrollView>
      </View>
    );
  }

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: mmkvPersister, maxAge: 1000 * 60 * 60 * 24 * 7 }}
      >
        <AuthProvider>
          {/* 通知のタップ遷移とトークン同期。許可はここでは求めない */}
          <PushProvider>
          <OutboxProvider>
            {/* 確認ダイアログ。Alert.alert は Web で動かないので全画面ここを使う */}
            <DialogProvider>
            {/* 操作の成否を知らせるトースト。Web の showToast() に相当 */}
            <ToastProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: color.appBg },
                /*
                  画面遷移は右からのスライド。
                  ⚠️ **既定に任せない。** iOS の native-stack は既定でもスライドするが、
                     Android と web では既定が別物（fade / なし）になり、
                     **同じ操作の見え方が端末で変わる。** 明示しておけば揃う。
                  ⚠️ 個別に上書きしている画面（集金モーダルの slide_from_bottom）は
                     そちらが勝つ。ここを変えてもモーダルの出方は変わらない。
                */
                animation: "slide_from_right",
              }}
            >
              {/*
                ⚠️ タブ全体を**スワイプで戻れなくする**。
                   新規登録は /login → push /signup と積んだうえで router.replace("/") し、
                   "/" が <Redirect href="/(tabs)" /> で更に置き換える。**この時点でも
                   /login が下に残っている**（replace が置き換えるのは自分だけで、
                   履歴は消えない）。iOS の画面端スワイプはこれを popping できてしまうので、
                   登録直後に右へ払うとログイン画面に戻る。gestureEnabled: false が唯一の防波堤。
                   ⚠️ ログインから入った場合は積まれないが、**経路によって変わるものに
                      頼らない**（2026-08-01 に /welcome を廃止したときも、この理由だけが
                      /signup 経由へ移って残った）。
                   ⚠️ タブの中の Stack（stores/ manage/）には影響しない。
                      あちらは自前の Stack が持つので、店舗詳細のスワイプ戻りは生きている。
              */}
              <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
              {/* 集金入力はフルスクリーンモーダル（設計図 7.2） */}
              <Stack.Screen
                name="collect/[storeId]"
                options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
              />
            </Stack>
            </ToastProvider>
            </DialogProvider>
          </OutboxProvider>
          </PushProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
