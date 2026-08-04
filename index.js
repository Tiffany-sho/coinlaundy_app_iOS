/**
 * ⚠️ **一時的な診断用のエントリポイント。原因が分かったら消し、
 *    package.json の "main" を "expo-router/entry" に戻すこと。**
 *
 * production ビルドが起動直後に落ちる（`RCTExceptionsManager reportFatal:`
 * → `abort()`）が、`app/_layout.tsx` の先頭でハンドラを入れても**間に合わない。**
 * expo-router のエントリは `_layout.tsx` に到達するまでに大量のモジュールを
 * 評価するので、そこで投げられた例外は**RN の既定ハンドラが先に捕まえて
 * プロセスごと殺す。**
 *
 * ⚠️ **したがって import の順番がすべて。** この 2 行を入れ替えないこと。
 */
import "./src/debug/crashReporter";
import "expo-router/entry";
