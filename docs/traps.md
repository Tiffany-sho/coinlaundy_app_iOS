# 実行環境の罠

実装中に実際に踏んだもの。型エラーにならず、動かして初めて気づく種類のもの。

## react-native-web（ブラウザ確認時）

ブラウザで確認しながら作るので、Web で動かない API を使うと「実装したのに何も起きない」状態になる。

- **`Alert.alert` は何もしない。** react-native-web の実装が `class Alert { static alert() {} }` の空クラス。確認ダイアログは必ず `src/components/common/dialog.tsx` の `useDialog()` を使う（削除ボタンが無反応だった原因はこれ）
- **ScrollView は `onScroll` しか呼ばない。** `ScrollViewBase` が DOM の `scroll` イベントだけを繋いでいる（`node_modules/react-native-web/dist/exports/ScrollView/ScrollViewBase.js` で確認済み）。したがって以下は**すべて一度も発火しない**:
  - `onScrollBeginDrag` / `onScrollEndDrag` / `onMomentumScrollEnd`
  - `onScroll` の event にも **`velocity` が無い**（`normalizeScrollEvent` が組まない）
  - 代わりに RNW が内部で 100ms の scrollend タイマーを持ち、停止後に最後の `onScroll` を 1 回出す
- **カルーセルを ScrollView で作らない。** 上のとおり Web では「どこから払い始めたか」「どれくらいの速さか」が取れないため、指で払う操作を組み立てられない。ブラウザ標準のスクロール（＝スライド）に乗るだけになる。`PanResponder` + `Animated` で自前に取ること（`src/components/home/useCardSwipe.ts`）。どちらも RN コアで RNW にも実装があり、ブラウザと実機で同じ経路になる
- **`snapToInterval` は無視される。** CSS scroll-snap が効くのは `pagingEnabled` のときだけ。1 枚ずつ送りたいなら自前で `scrollTo` する
- **`BackHandler` は `console.error` を出す。** `Platform.OS === "android"` でガードする
- **`FormData` は DOM のものなので `{ uri, name, type }` を受け付けない。** append すると `"[object Object]"` という文字列が送られ、サーバー側の `formData()` はファイルとして読めない。expo-image-picker が web で返す `asset.file`（`File`）を渡すこと（`src/api/queries.ts` の `uploadStoreImage`）

## expo-image-picker

- **選んだ画像の形式を `uri` の拡張子から判定しない。** web の `uri` は `blob:http://…/uuid`、Android は `content://…` で**どちらも拡張子が無い**。末尾を切り出すと URI 全体が「拡張子」になり、jpeg を選んでも弾かれる。`asset.mimeType`（web は `asset.file.type` も）を見ること
- **iPhone で撮った写真は既定で HEIC。`quality` を下げても JPEG にならない**（`ImageUtils.swift` が `case UTType.heic: return (rawData, ".heic")` で素通しする）。`preferredAssetRepresentationMode: Compatible` を渡すと PHPicker 側が JPEG にして返す
- **端末が返す `image/jpg` をそのまま BFF へ送らない。** `/api/v1/stores/images` は `["image/jpeg", "image/png"]` と厳密に比較するので、`image/jpeg` に正規化してから送る

## React Native 0.86

- `StyleSheet.absoluteFillObject` は**削除済み**。`StyleSheet.absoluteFill` を使う
- ⚠️ **`overflow: "hidden"` と影を同じ View に置かない。** iOS は影をビューの**外側**に
  描くので、同じ View でクリップすると**影が丸ごと消える。** 角丸で中身をクリップしたい
  ときは、外側の View に影 + `borderRadius` + `backgroundColor`（透明だと影の形が決まらない）、
  内側の View に `borderRadius` + `overflow: "hidden"` と分ける
  （`src/components/stores/StoreImageCarousel.tsx` がこの形）

## KeyboardAvoidingView

- ⚠️ **`keyboardVerticalOffset` を安易に渡さない。** `behavior="padding"` の下パディングは
  RN 側で `frame.y + frame.height - (keyboard.screenY - keyboardVerticalOffset)` と
  計算される。`frame` は**親基準の座標**なので、同じ親の中に置いた RN のヘッダの高さは
  `frame.y` に既に入っている。そこへ `insets.top + 60` のような値を渡すとヘッダ分を
  二重に数え、**ScrollView の下端がキーボードの上端より約 119px 高い位置で止まって
  帯状の余白が出る**（3 画面で同じ間違いをしていた）。
  必要なのは **`KeyboardAvoidingView` の上にネイティブのナビゲーションヘッダがある**
  （RN のレイアウトに含まれない）ときだけ
- **キーボードの上に残したいものは `KeyboardAvoidingView` の中に置く。** 外に出すと
  padding の外側になるのでキーボードの裏に完全に隠れる。集金画面の合計収益額と
  登録ボタンがこれで見えなくなっていた
- **キーボードが出ている間は `insets.bottom` を足さない。** ホームバーはキーボードに
  覆われているので不要で、足すと隙間になる。`useKeyboardVisible()`
  （`src/components/common/`）で出し入れを判定する。
  ⚠️ iOS は `keyboardWillShow`、Android は `keyboardDidShow`（iOS の `did` 系は
  アニメーション完了後に来るので一段遅れて見え、Android に `will` 系は無い）
- **web では `Keyboard` のイベントが一度も発火しない。** react-native-web の実装は
  `addListener()` が `{ remove: () => {} }` を返すだけの no-op で `isVisible()` も常に
  false（`dist/exports/Keyboard/index.js`）。落ちないので分岐は要らない

## expo-status-bar

- ⚠️ **`<StatusBar style="…" />` はマウント時に設定するだけで、アンマウント時に
  元へ戻さない。** 暗い背景の画面で `light` にすると、そこを離れた後も**白文字が
  残り続ける。** 背景が薄い水色（`color.appBg`）なので時計も電池も読めなくなる。
  ルートの `<StatusBar style="dark" />` は効果が 1 回だけなので戻してくれない。
  ⚠️ **画面から出ないと気づけない**（その画面の中では正しく見える）。
  画面ごとに変えたいときは `useStatusBarStyle()`（`src/components/common/`）を使う。
  `useFocusEffect` の後片付けで既定（`dark`）へ戻すので離れれば必ず黒文字になる
- web では `setStatusBarStyle` が no-op（`expo-status-bar` の `StatusBar.web.ts`）。
  呼んでも害は無いので分岐は要らない

## Hermes（実機の JS エンジン）

ブラウザ確認では最後まで再現しない。**実機で初めて出る。**

- ⚠️ **`new Date(<ISO でない文字列>)` は `Invalid Date` になる。** ISO 8601 以外の
  書式のパースは仕様上実装依存で、V8（Chrome / react-native-web）は寛容に通すが
  **Hermes は通さない。** 以後すべての getter が `NaN` を返す。
  実際に踏んだ形:

  ```js
  // ✗ 実機で Invalid Date。"7/30/2026, 11:51:51 AM" を食わせている
  new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }))
  ```

  これで `nowInJst()` が壊れ、**日付を扱う 7 画面が一斉に NaN になった。**
  型エラーも例外も出ず、ブラウザでは正常に見える。
  `src/shared/date.ts` の直し方（数値だけで組み立てる）を参照
- **TZ を跨ぐ変換に文字列を経由させない。** `toLocaleString` で出して読み直す形は
  ロケール・エンジン・OS のどれが変わっても壊れる。`Date.UTC` と `getUTC*` の
  算術だけで書けば全エンジンで同じ結果になる
- ⚠️ **`TZ=Asia/Tokyo node ...` は Git Bash では効かない**（値が空で渡る）。
  タイムゾーンを変えて検証するときは PowerShell で `$env:TZ` を使う。
  効いていないことに気づかないと「全 TZ で確認した」と誤認する

## シート（Modal の中のスクロール）

- ⚠️ **`ScrollView` 自身に `maxHeight` を付けない。1 回目のスクロールが空振りする。**

  ```tsx
  // ✗ 1 回目の指が空振りして、2 回目でようやく動く
  <View style={sheet}>
    <ScrollView style={{ maxHeight: 460 }}>…</ScrollView>
  ```

  `maxHeight` だけだと **ScrollView の高さが「中身」から決まる。** モーダルが
  スライドしてくる最中に「中身 = 枠」の状態で 1 回レイアウトが走り、
  **その瞬間はスクロールする必要が無い**ので指を降ろしても何も起きない。
  次のレイアウトで上限に収まって初めてスクロールできるようになる。

  **上限は親（シート本体）に持たせ、`ScrollView` は残りを埋めるだけにする**:

  ```tsx
  // ✓ 最初のレイアウトで高さが確定するので 1 回目から動く
  <View style={[sheet, { maxHeight: "88%" }]}>
    <ScrollView style={{ flexShrink: 1 }}>…</ScrollView>
  ```

  ⚠️ **エラーも警告も出ない。「なんとなく反応が悪い」としか感じない**ので、
  実機で触らないと見つからない。`StateEditSheet` が最初からこの形だった。
  行数の上限を保ちたいとき（`form.tsx` の `Select` は 6 行）は、
  **ScrollView を `maxHeight` を持つ `View` で包む**（上限を親に置くのは同じ）
- ⚠️ **`Pressable` の入れ子は原因ではない。** 一度そう見立てて
  `<Pressable 背景><Pressable 本体><ScrollView>` を組み替えたが、症状は変わらなかった。
  ただし**背景と本体は兄弟にするほうが素直**なので、その形には揃えてある:

  ```tsx
  <View style={{ flex: 1, justifyContent: "flex-end" }}>
    <Pressable style={{ ...StyleSheet.absoluteFill, backgroundColor: "…" }} onPress={onClose} />
    <View style={sheet}>…</View>
  ```

  ⚠️ 兄弟にしても「本体のタップで閉じてしまう」ことはない（背景は祖先ではないので
  タッチが伝わらない）。入れ子の `Pressable` は元々それを止めるためだけのものだった

## iOS

- **Modal の上に Modal を重ねると表示に失敗する。** 2 段階の選択（店舗を選んでからシートを出す等）は、1 段目を**閉じてから** `onDismiss` の後に 2 段目を開く
- ⚠️ **共有シート（`Share.share`）も同じ扱い。** RN の `Modal` を開いたまま呼ぶと、
  すでにモーダルを出している VC からさらに出すことになる。書き出しシートは
  **閉じてから `onDismiss` で共有する**（`app/(tabs)/revenue.tsx` の `pendingFile` がこれ）。
  ⚠️ `onDismiss` は **iOS 専用で web / Android では発火しない**ので、
  そちらは待たずに処理する分岐が要る（入れないとブラウザ確認で何も起きない）
- **ファイルの共有に `expo-sharing` は要らない。** RN 標準の `Share.share({ url })` が
  そのまま `UIActivityViewController` を出す。`RCTPresentedViewController()` が
  最前面の VC を辿るので、通常の画面からなら確実に出る。
  ⚠️ `message` を一緒に渡さないこと。受け取り側がテキストだけ拾ってファイルを落とす
- ⚠️ **iOS に「ダウンロードフォルダ」は無い。** 書き出したら必ず共有シートまで出すこと。
  保存先は `Paths.cache`（`document` に置くと iCloud バックアップに残り続ける）

## expo-router v4

- ⚠️ **型付きルート（`.expo/types/router.d.ts`）は dev server が動いたまま
  ファイルを増減させると壊れる。** 差分生成が働くので、
  - `account.tsx` を `account/index.tsx` に移すと `/settings/account` ではなく
    **`/settings/account/index`** という誤ったパスを吐く
  - 逆にディレクトリを足すと `/settings/account` の行が**丸ごと消える**
  - `src/components/**` のファイルが `/../src/components/…` として**ルート扱いで混入する**

  症状は `router.push("/settings/account")` が
  *is not assignable to parameter of type …* で落ちること。**コードは正しい。**
  直し方は全再生成:

  ```bash
  rm -f .expo/types/router.d.ts
  npx expo start --port 8092    # ⚠️ 動いている dev server と別のポートで
  ```

  ⚠️ **`npx expo start` は非対話モードだとポート衝突で黙って終わる**
  （`Port 8081 is being used` → `Skipping dev server`）。型は生成されないので、
  ファイルができたか確認すること。⚠️ Git Bash に `pkill` は無いので、
  後片付けは PowerShell の `Get-NetTCPConnection -LocalPort … | Stop-Process`

- ⚠️ **タブバーは「今いるタブ」を押しても何もしない。** react-navigation の
  `BottomTabBar` が `if (!isFocused)` で囲っているため。タブの中に Stack を
  入れている画面（`stores/` `manage/`）ではこれが行き止まりになる。
  ホームから `/stores/[id]` へ入ると**その Stack は詳細 1 枚だけ**になり、
  戻るは一覧ではなくホームへ抜け、店舗タブを押しても何も起きない
  ＝**一覧に二度と辿り着けない**。
  ⚠️ `unstable_settings.anchor: "index"` を書いてあっても防げない
  （効くのは URL からの復元で、他タブからの `router.push` では下に積まれない）。
  ⚠️ `dismissAll`（popToTop）でも直らない。積まれているのが 1 枚なので既に先頭。
  **`router.dismissTo("/stores")`** を `tabPress` で呼ぶこと（「その href まで pop、
  無ければ現在の画面を置き換える」なので、どちらの積まれ方でも一覧に着く）。
  スクロールを先頭へ戻すのは `useScrollToTop(ref)`（`expo-router` から取れる。
  ⚠️ 焦点があり、かつ Stack の 1 枚目のときだけ動く）

- `(tabs)` グループは URL に現れない
- `stores.tsx` と `stores/_layout.tsx` は**共存できない**。ディレクトリ化するなら単体ファイルは消す
- ⚠️ **`router.replace` は履歴を消さない。置き換えるのは自分の 1 枚だけ。**
  ログインは `/welcome` → `/login` と積んだうえで `router.replace("/")` し、
  `/` が `<Redirect href="/(tabs)" />` で更に置き換える。**この時点でも `/welcome` は
  下に残っている**ので、iOS の画面端スワイプで pop できてしまう
  （ログインした直後に右へ払うと未ログイン画面に戻る）。
  ルートの `<Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />` で塞ぐ。
  ⚠️ タブの**中**の Stack には影響しない（あちらは自前の Stack が持つ）ので、
  店舗詳細などのスワイプ戻りは生きたまま
- ⚠️ **タブの画面はマウントされたまま残る。ローカル state も前回の値のまま復活する。**
  タブを切り替えても unmount されないので、`useState` で持っている表示状態
  （管理タブの在庫 / 設備の切り替えなど）が前に開いたときのまま出る。
  ホームの「在庫状況」を押したのに設備が出ていた原因がこれ。
  **どこを開くかは必ず params で渡す**こと。
  ⚠️ 受け側の `useEffect` を再実行させるには**毎回変わる値も一緒に渡す**
  （同じ tab を続けて押すと params が変わらず効果が走らない）。
  ⚠️ 遷移は `push` ではなく **`navigate`**。`push` は同じ画面をスタックに積み増すので、
  押した回数だけ戻る操作が要るようになる
- **フッター（タブバー）を残したい画面はタブ配下に Stack をネストする。** `app/(tabs)/stores/_layout.tsx` がその例。`app/` 直下に置くとタブバーが消える
- ⚠️ **`presentation: "fullScreenModal"` の画面ではルートの `Modal` が出せない。**
  react-native-screens はルートの UIViewController から新しい VC をモーダル表示するので、
  ルートの React ツリーにある `Modal`（`DialogProvider`）は「すでにモーダルを出している
  VC から更にモーダルを出す」ことになり、**何も表示されずに失敗する。**
  Metro に `Attempt to present ... which is already presenting ...` が出る。
  ダイアログの結果を待つ処理は**押しても無反応**になる（集金画面のキャンセルと戻るが
  これで死んでいた）。**その画面の中で `DialogProvider` を包み直す**と直る
- ⚠️ **同じ理由で、ルートの絶対配置オーバーレイもモーダル画面の下に隠れる。**
  `ToastProvider` は `position: "absolute"` なので（`Modal` ですらない）、
  `fullScreenModal` の画面に留まったまま出すトースト（入力検証エラーなど）は見えない
- **モーダル画面のトーストは 2 つ使い分ける。** `ToastProvider` を画面の中で包み直すと
  画面に留まるトーストは見えるようになるが、⚠️ **`router.back()` の直前に出すトーストが
  画面のアンマウントと同時に消えて一瞬も読めなくなる。** そこで**包む前にルート側を
  掴んでおき**、両方を持ったまま下へ渡す（`app/collect/[storeId].tsx` がこれ）:

  ```tsx
  export default function Screen() {
    const rootToast = useToast();            // ← 包む前に掴む＝ルート側
    return (
      <DialogProvider>
        <ToastProvider>
          <Inner rootToast={rootToast} />    // 中では useToast() がネスト側になる
        </ToastProvider>
      </DialogProvider>
    );
  }
  ```

  `router.back()` の直前は `rootToast`、画面に留まるときは `useToast()`。
  逆にすると「一瞬も出ない」か「見えない」のどちらかになる
- 全画面まとめて直すなら react-native-screens の `FullWindowOverlay`。別 UIWindow に
  描くのでネイティブのモーダルより上に出る。⚠️ iOS 専用で、中に `Modal` は置けないので
  `DialogProvider` の作りごと変えることになる
- ⚠️ **`presentation: "fullScreenModal"` は下の画面をアンマウントしない。** 画面いっぱいに
  覆うので消えたように見えるが、Stack の上に載っているだけ。したがって
  **モーダルから戻ってきたときに下の画面の `useEffect` は再実行されない**（deps が
  変わらなければ）。「モーダルで何かした結果を見て動く処理」を `useEffect` に書くと
  黙って動かず、次回起動まで気づけない。`useFocusEffect` を使う
  （`src/push/usePushPriming.ts` がこれで壊れていた。集金を登録してもプライミングが
  出なかった原因）

## FlashList

- **並び順を変えたらスクロール位置を明示的に戻す。** 行の構成ごと変わる（売上順は月見出しが無い／日付順はある）ため、位置を保つと同じ座標に別の行が来て画面が飛ぶ。`app/(tabs)/revenue.tsx` は売上履歴の見出しの y を `onLayout` で測っておき、並び替えのたびにそこへ `scrollToOffset` する。**「さらに表示」では動かさない**（押した位置に留まりたい操作）
- **`scrollToOffset` の `skipFirstItemOffset` は既定 `true` で、これは「ヘッダ高さを足さない」＝生のコンテンツ座標という意味。** 名前から受ける印象と逆なので注意（`false` にすると `firstItemOffset` が加算される）
- ヘッダ内の要素の `onLayout` の `y` は ListHeaderComponent 基準。コンテンツ座標にするには `contentContainerStyle` の `paddingTop` を足す

## Windows

- **同じディレクトリに `historyRows.ts` と `HistoryRows.tsx` を置けない。** 大文字小文字しか違わないファイルを tsc が同一視して TS1149 / TS1261 になる。役割で名前を分ける（`historyRows.ts`＝組み立て、`FundHistoryRows.tsx`＝見た目）

## App Store 審査

- ⚠️ **Web のページをアプリに出す経路はもう無い**（2026-07-30 に WebView を廃止し、
  規約とプライバシーはアプリ内のテキストになった。`src/content/legal/`）。
  したがって下の 2 つは**復活させるときだけ**効く話:
  - アプリ内 WebView に出してよいのは Web 側の `/app/*` だけ。`/terms` は
    「Proプラン ¥780/月」、`/tokushoho` は販売価格と決済条件、`/help` は
    「アップグレードができます」を含む
  - **本文を消しただけでは足りない。** Next の `src/app/layout.js` が全ページを
    Navbar + Footer で包んでいるので、規約ページからナビ経由でプラン画面へ辿れる。
    `appLegalPaths.js` に載せてナビごと消し、アプリ側も許可リストで止める。
    **片方だけ直しても意味がない**
- ⚠️ **「アプリ内課金が無い」を前提にした判断は 2026-07-29 に全部失効している。**
  IAP を入れたため。この節にはもともと「特商法はアプリ内課金が無い以上、掲示義務が
  生じない」と書いてあったが、**前提が逆になっている。**
  - 特商法は今もアプリに載せていない。理由は「App Store 経由の購読では Apple が
    販売者になる」こと。⚠️ **法務の判断なので審査提出前に確認すること**
  - 利用規約は逆に**購読の条件を書く側に変わった**（第5条・第6条）。
    Guideline 3.1.3(a) が禁じるのは**外部での購入への誘導**であって、
    アプリ内課金の条件を書くことではない。3.1.2 はむしろ開示を求める
  - ⚠️ **価格を数字で書かない**のは今も同じ（出してよいのは `displayPrice` だけ）

## プッシュ通知（expo-notifications）

- **Expo Go では届かない。** SDK 53 以降、iOS の Expo Go はリモートプッシュに対応しない。
  確認には EAS の development build が要る
- **`getExpoPushTokenAsync()` には projectId が要る。** `eas init` を実行するまで
  `app.json` に入らないので、それまでトークンは取れない（`src/push/pushToken.ts` が
  事前に確認して警告を出す）
- **シミュレータではトークンを取れない。** `Device.isDevice` で弾くこと
- ⚠️ **一度拒否されるとアプリからは二度とダイアログを出せない。**
  `requestPermissionsAsync()` は何も表示せず即 denied を返す。設定アプリへ誘導するしかない。
  だから起動直後に聞かず、初回の集金登録後にプライミングを挟んでいる
- **通知の許可を集金モーダルの中で求めない。** iOS は Modal の上に Modal を重ねられない。
  閉じてホームに戻ってから `usePushPriming` が出す
- **expo-iap と違い、web でも落ちない。** `*.native.js` の隣に web 用の `*.js` があり、
  リスナーは no-op、許可はブラウザの Notification API にフォールバックする。
  ただし呼ぶたびに console.warn が出るので `isPushSupported()` で塞いでいる
- **`react-native-mmkv` v4 のキー削除は `remove()`。** `delete()` は存在しない

## EAS / 実機に入れるまで

新しい端末を足すときに毎回同じところで止まるので、順番と落とし穴だけ。

- **コマンドは `npx eas-cli`。** `npx eas` は
  *could not determine executable to run* で落ちる。npx が引数を**パッケージ名**として
  探すのに対し、パッケージ名は `eas-cli` で、その中の実行ファイルが `eas` という名前
  だから。グローバルに入れれば（`npm i -g eas-cli`）`eas` だけで通る
- ⚠️ **端末登録はビルドより前に。** Ad Hoc のプロビジョニングプロファイルは
  ビルド時点で登録されている端末しか含まない。後から登録した端末は
  インストールできず、**ビルドのやり直しになる**（`eas-cli device:list` で先に確認）
- **`device:create` は `Website` を選ぶ。** `Current Machine` は Apple Silicon Mac 用
  なので Windows では使えない。QR は **Safari で開く**（Chrome では構成プロファイルを
  扱えない）
- ⚠️ **プロファイルはダウンロードしただけでは入らない。** iOS 16 以降は
  設定 → 一般 → VPN とデバイス管理 → インストール、まで手で進める必要がある
- ⚠️ **iOS 16 以降はデベロッパモードが要る。** development ビルドを起動すると
  「デベロッパモードが必要です」で止まる。設定 → プライバシーとセキュリティ →
  デベロッパモード → オン → **端末を再起動**（再起動しないと有効にならない）。
  この項目は**開発署名のアプリを起動しようとした後でないと設定に現れない**
- **APNs キーは Team で 1 個あれば足りる。** `eas-cli credentials` の
  `Set up your project to use Push Notifications` を選べば作成と割り当てを両方やる。
  ⚠️ `Add a new push key` を繰り返すと **Apple の上限（アカウント 2 個）**に当たる。
  `.p8` は一度しかダウンロードできないので、自分で保存せず EAS に預けたままにする
- **`developmentClient: true` のビルドは JS を埋め込まない。** 起動には
  `npx expo start --dev-client` が要り、`EXPO_PUBLIC_*` は**ローカルの `.env.local`**
  が効く（EAS 側の環境変数が必須になるのは `preview` / `production` から）
- ⚠️ **パッケージを足しても再ビルドが要らない場合がある。** ネイティブモジュールでも、
  それが**すでに依存ツリーの中にあって autolink 済み**なら、直接依存に上げるだけでは
  ネイティブの構成が変わらない。`expo-file-system` がこれ（`expo` 本体が依存している）。
  ⚠️ ただし**バージョンを変えると話が別**なので、`npx expo install` で
  SDK に合ったものを入れること。「added 1 / removed 1」＝巻き上げただけ、が目印

## Node / 検証環境

- ⚠️ **Git Bash に `$TMPDIR` は無い。** 展開に失敗して `/` 直下を触りにいき
  *Permission denied* になる。一時ファイルはスクラッチパッドの絶対パスを使う
- **`node --experimental-strip-types` で `.ts` をそのまま実行できる**（Node 22 以降）。
  依存の無い純関数（`src/components/stores/prefecture.ts` など）の確認に使える。
  ⚠️ Windows では import 先を **`file:///c:/…` の URL** で書くこと。
  `c:/…` のままだと *ERR_UNSUPPORTED_ESM_URL_SCHEME* で落ちる

## pg_cron → pg_net → Edge Function

004 を適用したあと、通知が届かないときに見る場所。**失敗が 2 つのテーブルに
分かれて記録される**ので、片方だけ見ると原因を見落とす。

| テーブル | 捕まえるもの |
|---|---|
| `cron.job_run_details` | **積む前**の失敗 — URL が不正、Vault の行が無い／2 つある |
| `net._http_response` | **積んだ後**の結果 — 403 / 401 / 404 / タイムアウト |

- ⚠️ **`status = 'succeeded'` は「HTTP が成功した」ではない。** `net.http_post` は
  要求をキューに積んで即座に返るので、Edge Function が 403 でも 404 でも
  タイムアウトでも `succeeded` になる。**積んだ後の結果は `net._http_response`
  にしか出ない**（`id` が増えているかで見る）
- **ただし `status = 'failed'` は本物で、原因が `return_message` に書かれている。**
  最初に見るべきはこちら。URL を `https://<PROJECT_REF>.supabase.co/…` のまま
  Vault へ入れていたときは、毎時こう記録されていた:

  ```
  ERROR:  Quote command returned error
  CONTEXT: net._encode_url_with_params_array(url, params_array)
  ```

  `<` `>` は URL に使えないので、`net.http_post` は**キューに積む前に例外を投げる**。
  ⚠️ この経路では `net._http_response` に行が 1 つも増えないため、応答テーブルだけ
  見ていると「撃ったのに何も起きない」に見えて原因が分からない
- ⚠️ **`vault.create_secret` は値を検証しない。** プレースホルダのままでも成功する。
  長さで見分けられる（正しい URL は **70 文字**、`<PROJECT_REF>` のままだと 63）。
  004 に番人を入れてあるので、貼り直すときもそれ経由で入れること
- **同名の Vault シークレットを 2 つ作らない。** cron の本文は
  `(SELECT decrypted_secret … WHERE name = '…')` の単一行サブクエリなので、
  004 を 2 回実行すると *more than one row returned by a subquery* で毎時失敗する
- **`:00` を待たずに手で撃って切り分ける。** cron の本文をそのまま SQL Editor で
  実行すれば同じ経路を通る。**例外はその場で表示されるので、`cron.job_run_details`
  を待つより速い。** 応答の読み方:

  | | |
  |---|---|
  | 200 + `{"sent":0,"reason":"no_target_org"}` | 正常（集金日が前日・当日でないだけ） |
  | 403 | Vault の値と `supabase secrets set CRON_SECRET` が食い違い |
  | 401 | `--no-verify-jwt` 無しでデプロイした。**関数のコードに到達していない** |
  | 404 | URL の project ref か関数名が違う |
  | `status_code` が NULL + `error_msg` あり | pg_net が外に出られていない |
  | 行が増えない | pg_net のワーカーが停止。`net.worker_restart()` で復帰 |

- **`net._http_response` の行は数時間で消える。** 調べるのは撃った直後に
- **`no_target_org` を失敗と読まない。** 通知が出るのは `daysUntil` が 0 か 1 の
  ときだけ（`index.ts` の判定）。`?dryRun=1` は日付判定を飛ばして `daysUntil` を 0 に
  上書きするので、**空撃ちと手撃ちで `reason` が変わるのは正常**

## アプリ内課金（expo-iap / StoreKit）

まだ実機で通していない。以下は Apple のドキュメントと expo-iap の実装から分かっている分。

- **Expo Go では動かない。** ネイティブモジュールなので EAS の development build が要る。
  Expo Go で開くと `initConnection` の時点で失敗する
- ⚠️ **有料アプリ契約（Paid Apps Agreement）が Active でないと `fetchProducts` は
  空配列を返すだけで、エラーも警告も出ない。** 商品が出ないときの原因はほぼこれ。
  商品を作っただけでは足りず、App Store Connect > ビジネス で銀行口座と税務情報が
  受理されている必要がある
- **`fetchProducts` に `type: "subs"` を渡さないと自動更新サブスクは 1 件も返らない**
  （既定は in-app 扱い）
- **`onPurchaseSuccess` は自分が `requestPurchase` したときだけ来るとは限らない。**
  アプリを閉じている間に完了した購入や、承認待ち（Ask to Buy）が通った購入も
  接続時にまとめて流れてくる。「購入ボタンを押した直後」を前提に組まないこと
- **Sandbox の購読は実時間 3〜60 分で更新・失効を繰り返す**（1 か月 = 5 分など）。
  「勝手に失効した」ように見えるのは仕様
- `deepLinkToSubscriptions()` は iOS の購読管理を開くだけ。**自前の「解約する」ボタンを
  作らない**（押しても何も起きない）

## react-query の永続キャッシュ（MMKV）

- ⚠️ **API の応答に項目を足したら、その項目は「無いことがある」と考える。**
  `PersistQueryClientProvider` が MMKV から**前のバージョンの応答をそのまま復元**し、
  起動直後はそちらが `data` として即座に返る（`maxAge` は 7 日）。
  型は新しいので **TypeScript は何も言わない**が、実体は `undefined`。

  ```ts
  // ✗ 前のキャッシュでは count が undefined。合計が NaN になり画面に出る
  stores.reduce((sum, s) => sum + s.count, 0)
  // ✗ undefined !== null は true なので素通りする。Math.min(undefined) = NaN
  dates.filter((d) => d !== null)
  ```

  数値であることまで確かめる（`?? 0` / `Number.isFinite`）。
  ⚠️ **開発機では踏みにくい。** アプリを入れ直すとキャッシュごと消えるので、
  「前のバージョンを一度起動した端末」でしか出ない

- ⚠️ **サーバの値をフォームに流し込む `useEffect` の依存に、応答のオブジェクトや配列を
  そのまま置かない。** react-query は画面復帰や再接続でも取り直すので、中身が同じでも
  新しい参照が来て**入力途中の値が戻る。**

  ```ts
  // ✗ data も data.days も参照。取り直すたびに選択が戻る
  useEffect(() => { setDays(data?.days ?? []); }, [data]);
  // ✓ 文字列に畳んでから比べる
  const daysKey = (data?.days ?? []).join(",");
  useEffect(() => { … }, [daysKey]);
  ```

  文字列・数値のフィールドを個別に並べるなら参照ではないのでそのままでよい
  （`[profile?.username, profile?.full_name]`）

## Metro / dev server

- ⚠️ **8081 が埋まっていると、`expo start` は黙って 8082 に落ちる。** 開発ビルドは
  記憶している 8081 を見にいくので、**別のサーバーに当たって繋がらない**。
  ポートがずれたこともモードが違うことも端末の画面には出ない。
  実際に「昨日の `expo start --port 8081`（**`--dev-client` 無し**＝Expo Go 用）が
  居座り、今日の `--dev-client` が 8082 に落ちていた」形で踏んだ。
  ⚠️ **繋がらないときはまず二重起動を疑う**:

  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    ForEach-Object { "{0} | {1}" -f $_.ProcessId, $_.CommandLine }
  ```

  `expo` のものだけ落として `npx expo start --dev-client --clear` で 1 本に戻す。
  ⚠️ 同じ PC で別プロジェクトの dev server も動いているので**全部殺さないこと**
- ⚠️ **`npm install` を挟んだら Metro を必ず再起動する。** 起動中のサーバーは
  ファイル一覧を起動時の状態で持っているので、あとから巻き上げられた
  パッケージを解決できず *Unable to resolve module* になる。
  ⚠️ **エラーの文面はパッケージ内部のファイル（`./url` など）を指すので、
  自分のコードのせいに見えない**。実際に `expo-file-system` を足した直後に踏んだ
- **切り分けは Metro のログが早い。** 端末に赤い画面が出ていても、サーバー側の
  ログに `Unable to resolve` が無ければ**それは別のサーバーが返したもの**

## BFF のルートを足したとき

- ⚠️ **新しい静的ルートを本番に出す前にアプリから叩くと、404 ではなく 405 が返る。**
  `/api/v1/funds/export` が無いと、パスが**動的セグメントの `funds/[id]` に吸われる**
  （`id = "export"`）。あちらは POST を公開していないので **405 Method Not Allowed**。
  ⚠️ **405 の body は空**なので `apiFetch` の `response.json()` が失敗し、
  画面には既定の「**エラーが発生しました**」しか出ない。**未デプロイだと気づけない。**
  形式や条件を変えても同じ文言になるのが目印（実際に CSV / Excel の両方で同じ症状が出た）。
  疑ったら本番を直接叩く:

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://www.collecie.com/api/v1/<新ルート>
  # 405 → 未デプロイ（[id] に吸われている） / 401 → デプロイ済み
  ```

- ⚠️ **デプロイ後は静的ルートが動的ルートより優先される**ので、`[id]` 側は壊れない
  （`funds/chart` が先例）。ただし **`id` がその名前になり得ないこと**は確かめること

## 画面遷移と登場アニメーション

2026-07-31 に足したもの。**どれも「書いたのに動かない」形で外れる**ので、
動いていないときに見る場所を残しておく。

- ⚠️ **ルートの `Stack` の `screenOptions` は入れ子の `Stack` に降りてこない。**
  `app/_layout.tsx` に `animation` を書いても、`app/(tabs)/stores/_layout.tsx` と
  `manage/_layout.tsx` の中の遷移は**無アニメーションのまま**になる。
  各 `_layout.tsx` に同じものを書くこと。エラーも警告も出ない
- ⚠️ **`Tabs` の `animation` に `"slide_from_right"` は渡せない。** 受け付けるのは
  **`"none" | "fade" | "shift"` の 3 つだけ**（`TabAnimationName`）。
  **既定は `"none"`** なので、明示するまでタブは瞬間で入れ替わる。
  左右に滑らせたいなら `"shift"` が唯一の選択肢
- ⚠️ **iOS の native-stack は既定でもスライドするので「効いている」ように見える。**
  Android と web は既定が別物なので、明示しないと**同じ操作の見え方が端末で変わる**。
  ブラウザ確認だけでは気づけない
- ⚠️ **仮想化リストの行に登場アニメーションを付けない。** FlashList / FlatList の
  セルは使い回されるので、**スクロールするたびに古い行が「新しく現れ直す」**。
  付けてよいのは `ListHeaderComponent` の中と、リストの外に置いた静的な塊だけ
  （`app/(tabs)/stores/index.tsx` の検索・絞り込み、`revenue.tsx` のヘッダ）
- ⚠️ **`onLayout` で位置を測っている View を包まない。** `layout.y` は
  **親からの相対位置**なので、包むと親が `Appear` になって **`y` がほぼ 0 になる。**
  `revenue.tsx` はこれで壊れた（並び替えのたびに履歴の頭ではなく**月別売上のあたり**へ
  飛ぶ）。**測る View を外側、`Appear` を内側**にすること:

  ```tsx
  // ✗ y が 0 になる
  <Appear index={3}><View onLayout={onHistoryLayout}>…</View></Appear>
  // ✓ 親が元のままなので y が変わらない
  <View onLayout={onHistoryLayout}><Appear index={3}>…</Appear></View>
  ```

  ⚠️ **「`transform` はレイアウトを動かさないから安全」は誤り。** それは本当だが、
  **包むこと自体が親を変える**のは別の話で、こちらが原因になる
- ⚠️ **`Appear` は条件分岐の外側に置く。** 中身が別のコンポーネントに切り替わる場所
  （管理タブの在庫 / 設備）で内側に置くと、切り替えるたびに全カードが出直す。
  外に置けば Appear 自身は残るので初回の 1 度しか動かない
- ⚠️ **タブの画面は unmount されない**ので、タブを戻ってきても再生されない
  （＝毎回ちらつかない）。これは狙った挙動。`useFocusEffect` で再生させ直さないこと
- **`useNativeDriver: true` は web で警告を出すが動く。**
  `Animated: useNativeDriver is not supported because the native animated module is
  missing. Falling back to JS-based animation.` が出るだけで、JS 実装に落ちて動く。
  実機ではネイティブ駆動になるので**この警告を理由に外さないこと**
- **`react-native-reanimated` は入っているが 1 行も使っていない。** アニメーションは
  RN コアの `Animated`（`toast.tsx` / `MonthlySalesCarousel.tsx` / `Appear.tsx`）で
  揃えてある。⚠️ reanimated へ移ると **babel の worklets プラグインの設定が要る**
  （`babel.config.js` が無い＝`babel-preset-expo` の自動検出に任せている状態）ので、
  使い始めるなら先にそこを確かめること

## 検証

- 型チェックは `npx tsc --noEmit`
- **バンドルを grep して日本語を探すと false negative になる。** JSX の属性値と子要素の文字列は `\uXXXX` エスケープで出力されるため。反映確認はソース側で行う

## 開発環境

- 実機で見るときは `.env.local` の `EXPO_PUBLIC_API_BASE_URL` を LAN IP にする（`http://192.168.0.17:3000/api/v1`）。`localhost` のままだと端末自身を見にいく
- Wi-Fi プロファイルが「パブリック」でも node.exe の受信は許可済み。dev の CORS は任意の Origin をエコーする
