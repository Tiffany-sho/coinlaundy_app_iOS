import { Tabs, router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useBootstrap } from "@/api/queries";
import { color, font } from "@/theme/tokens";

/**
 * タブバーの中身（アイコン + ラベル）の高さ。下端の余白はここに含めない。
 * ⚠️ 減らさないこと。アイコン 22px + ラベル 11px + 行間で、これ未満だとラベルが切れる。
 */
const TAB_BAR_CONTENT_HEIGHT = 66;

/** ホームインジケータが無い端末でも下に指を置ける最低限の余白 */
const TAB_BAR_MIN_BOTTOM = 18;

/**
 * 「今いるタブをもう一度押したら、そのタブの先頭画面へ戻す」ためのリスナー。
 *
 * ⚠️ **React Navigation の既定は「今いるタブを押しても何もしない」。**
 *    BottomTabBar の onPress が `if (!isFocused)` で囲われているため。
 *    タブの中に Stack を入れている stores / manage では、これが行き止まりを生む:
 *    ホームのクイックアクションから `/stores/[id]` へ入ると、店舗タブの Stack は
 *    **詳細 1 枚だけ**になり（一覧がその下に積まれない）、
 *      - 戻る → 一覧ではなくホームへ抜ける
 *      - 店舗タブを押す → 既に focused なので**何も起きない**
 *    となって**店舗一覧に二度と辿り着けなくなる。**
 *
 * ⚠️ **`dismissAll`（popToTop）では直らない。** 積まれているのが詳細 1 枚なので、
 *    その 1 枚が既に「先頭」であり何も起きない。
 *    `dismissTo` は「その href まで pop、無ければ**現在の画面を置き換える**」ので
 *    どちらの積まれ方でも一覧に着く。
 *
 * 先頭画面に既にいるときは何も起きない。そのときスクロールを上に戻すのは
 * 各タブの `useScrollToTop(ref)` の担当（こちらは tabPress を別途拾っている）。
 */
function backToTabRoot(href: Href) {
  return ({ navigation }: { navigation: { isFocused: () => boolean } }) => ({
    tabPress: () => {
      if (navigation.isFocused()) router.dismissTo(href);
    },
  });
}

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
        /*
          タブの切り替えを左右へ滑らせる。
          ⚠️ **既定は "none"（瞬間で入れ替わる）。** 明示しないと動かない。
          ⚠️ 使える値は "none" | "fade" | "shift" の 3 つだけで、
             Stack のような "slide_from_right" は**受け付けない**（型エラーになる）。
             左右に滑らせたいなら "shift" が唯一の選択肢。
        */
        animation: "shift",
        tabBarActiveTintColor: color.teal,
        tabBarInactiveTintColor: color.textFaint,
        /* ⚠️ ラベルは必ず出す。アイコンだけだと「水滴＝店舗」「箱＝管理」が伝わらない。
              既定でも出るが、既定に頼ると将来の更新で消えても気づけないので明示する */
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontFamily: font.uiBold, fontSize: 11, marginTop: 3 },
        // Web のフッターは白 95% の半透明。上端に細い区切り線だけ入る
        tabBarStyle: {
          backgroundColor: color.cardBg,
          borderTopColor: color.divider,
          borderTopWidth: 1,
          height: TAB_BAR_CONTENT_HEIGHT + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
        },
        /* ⚠️ paddingVertical を足さないこと。tabBarStyle 側で高さを決めているので、
              ここで詰めるとアイコンとラベルの間が潰れてラベルが切れる */
        tabBarItemStyle: { paddingVertical: 0 },
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
        listeners={backToTabRoot("/stores")}
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
        listeners={backToTabRoot("/manage")}
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
