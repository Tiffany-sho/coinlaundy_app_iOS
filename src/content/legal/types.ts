/**
 * 法務文書（利用規約・プライバシーポリシー）をアプリ内で描くためのデータ形。
 *
 * ============================================================================
 * ⚠️ **ここにあるのは Web からの複製である。正本は Web リポジトリ側。**
 *
 *   利用規約         ../coin-laundry-app/src/app/app/terms/page.jsx
 *   プライバシー     ../coin-laundry-app/src/app/privacy/page.jsx
 *                    （/app/privacy はこれをそのまま描画している）
 *
 * ⚠️ **どちらか片方だけ直すと食い違う。必ず両方を同時に直すこと。**
 *    Web リポジトリは元々「法務文書を写経しないこと」という方針で、
 *    /app/privacy が /privacy を再利用しているのはそのため。
 *    2026-07-30 に**アプリ側の表示速度を優先して複製に切り替えた**
 *    （WebView が毎回 Supabase のセッション更新を経由して 0.3〜1.0 秒かかっていた）。
 *    速度と引き換えに同期の義務を負っているので、忘れると古い規約が
 *    アプリに出続ける。詳細は docs/contracts.md の「法務文書」。
 *
 * ⚠️ **文面を「アプリ向けに」書き換えないこと。** 条文の取捨選択は Web 側の
 *    /app/terms（アプリ専用版）で既に済んでいる。
 *    ここでさらに変えると、どちらが正しいのか誰にも分からなくなる。
 *
 * ⚠️ 2026-07-31 まで、ここには「料金・解約の条項は落としてあるので足さないこと」と
 *    書いてあった。**アプリが何も売らなかった頃の前提で、IAP を入れた時点で失効している。**
 *    利用規約の第5条・第6条は現在 App Store 経由の購読を前提に入っている。
 *    Guideline 3.1.3(a) が禁じるのは**外部（Web・Stripe）での購入への誘導**であって、
 *    アプリ内課金の条件を書くことではない（3.1.2 はむしろ開示を求める）。
 * ============================================================================
 */

export type LegalBlock =
  /** 段落 */
  | { kind: "paragraph"; text: string }
  /** 「・」付きの箇条書き */
  | { kind: "list"; items: string[] }
  /** 用語 + 説明（外部サービスの一覧など） */
  | { kind: "definitions"; items: { term: string; description: string }[] }
  /** 連絡先。薄い背景の箱で囲む */
  | { kind: "contact"; name: string; lines: string[] };

export type LegalSection = {
  /** 「第1条 サービスの概要」「1. 取得する情報」など、正本の見出しをそのまま */
  heading: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  title: string;
  /** 見出しの直下に出る前書き */
  lead: string;
  sections: LegalSection[];
  /** 「制定日：2026年5月29日」 */
  establishedAt: string;
};
