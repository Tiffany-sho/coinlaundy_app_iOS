# 実行環境の罠

実装中に実際に踏んだもの。型エラーにならず、動かして初めて気づく種類のもの。

## react-native-web（ブラウザ確認時）

ブラウザで確認しながら作るので、Web で動かない API を使うと「実装したのに何も起きない」状態になる。

- **`Alert.alert` は何もしない。** react-native-web の実装が `class Alert { static alert() {} }` の空クラス。確認ダイアログは必ず `src/components/dialog.tsx` の `useDialog()` を使う（削除ボタンが無反応だった原因はこれ）
- **ScrollView は `onScroll` しか呼ばない。** `ScrollViewBase` が DOM の `scroll` イベントだけを繋いでいる（`node_modules/react-native-web/dist/exports/ScrollView/ScrollViewBase.js` で確認済み）。したがって以下は**すべて一度も発火しない**:
  - `onScrollBeginDrag` / `onScrollEndDrag` / `onMomentumScrollEnd`
  - `onScroll` の event にも **`velocity` が無い**（`normalizeScrollEvent` が組まない）
  - 代わりに RNW が内部で 100ms の scrollend タイマーを持ち、停止後に最後の `onScroll` を 1 回出す。スクロール終了はこれを自前でデバウンスして検出する（`src/components/home/useCardPaging.ts`）
- **`snapToInterval` は無視される。** CSS scroll-snap が効くのは `pagingEnabled` のときだけ。1 枚ずつ送りたいなら自前で `scrollTo` する
- **`BackHandler` は `console.error` を出す。** `Platform.OS === "android"` でガードする

## React Native 0.86

- `StyleSheet.absoluteFillObject` は**削除済み**。`StyleSheet.absoluteFill` を使う

## iOS

- **Modal の上に Modal を重ねると表示に失敗する。** 2 段階の選択（店舗を選んでからシートを出す等）は、1 段目を**閉じてから** `onDismiss` の後に 2 段目を開く

## expo-router v4

- `(tabs)` グループは URL に現れない
- `stores.tsx` と `stores/_layout.tsx` は**共存できない**。ディレクトリ化するなら単体ファイルは消す
- **フッター（タブバー）を残したい画面はタブ配下に Stack をネストする。** `app/(tabs)/stores/_layout.tsx` がその例。`app/` 直下に置くとタブバーが消える

## 検証

- 型チェックは `npx tsc --noEmit`
- **バンドルを grep して日本語を探すと false negative になる。** JSX の属性値と子要素の文字列は `\uXXXX` エスケープで出力されるため。反映確認はソース側で行う

## 開発環境

- 実機で見るときは `.env.local` の `EXPO_PUBLIC_API_BASE_URL` を LAN IP にする（`http://192.168.0.17:3000/api/v1`）。`localhost` のままだと端末自身を見にいく
- Wi-Fi プロファイルが「パブリック」でも node.exe の受信は許可済み。dev の CORS は任意の Origin をエコーする
