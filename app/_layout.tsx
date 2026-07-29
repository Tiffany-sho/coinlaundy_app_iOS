import { useEffect } from "react";
import { Stack } from "expo-router";
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
              }}
            >
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
