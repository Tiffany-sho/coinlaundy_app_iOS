import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap } from "@/api/queries";
import { color, font } from "@/theme/tokens";

/** タブバーの中身（アイコン + ラベル）の高さ。下端の余白はここに含めない */
const TAB_BAR_CONTENT_HEIGHT = 60;

/** ホームインジケータが無い端末でも下に指を置ける最低限の余白 */
const TAB_BAR_MIN_BOTTOM = 12;

/**
 * Web の FooterNavbar と同じタブ構成にする。
 * 組織未所属は RESTRICTED_NAV_ITEMS と同じくホーム / 設定の 2 つだけ表示する。
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { data } = useBootstrap();
  const hasOrg = Boolean(data?.organization);

  /**
   * ⚠️ 高さを固定値にすると、ホームインジケータのある端末でラベルが下端に張り付く。
   *    中身の高さ + 安全領域で組む。各画面の contentContainerStyle の paddingBottom も
   *    これと同じだけ確保しないと最下部がタブバーに隠れる。
   */
  const bottomInset = Math.max(insets.bottom, TAB_BAR_MIN_BOTTOM);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.teal,
        tabBarInactiveTintColor: color.textFaint,
        tabBarLabelStyle: { fontFamily: font.ui, fontSize: 10, marginTop: 2 },
        // Web のフッターは白 95% の半透明。上端に細い区切り線だけ入る
        tabBarStyle: {
          backgroundColor: color.cardBg,
          borderTopColor: color.divider,
          borderTopWidth: 1,
          height: TAB_BAR_CONTENT_HEIGHT + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
        },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ホーム",
          tabBarIcon: ({ color: c, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} color={c} size={22} />
          ),
        }}
      />
      {/* stores は 1 画面ではなく Stack（一覧 → 詳細 → 集金履歴）。
          入れ子にしてあるので詳細へ進んでもタブバーが出たままになる */}
      <Tabs.Screen
        name="stores"
        options={{
          title: "店舗",
          href: hasOrg ? undefined : null,
          tabBarIcon: ({ color: c, focused }) => (
            <Ionicons name={focused ? "water" : "water-outline"} color={c} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="revenue"
        options={{
          title: "収益",
          href: hasOrg ? undefined : null,
          tabBarIcon: ({ color: c, focused }) => (
            <Ionicons name={focused ? "cash" : "cash-outline"} color={c} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          title: "管理",
          href: hasOrg ? undefined : null,
          tabBarIcon: ({ color: c, focused }) => (
            <Ionicons name={focused ? "cube" : "cube-outline"} color={c} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "設定",
          tabBarIcon: ({ color: c, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} color={c} size={22} />
          ),
        }}
      />
    </Tabs>
  );
}
