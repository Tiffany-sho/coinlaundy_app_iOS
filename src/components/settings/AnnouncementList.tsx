import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Card, Muted } from "@/components/common/ui";
import { formatJstDate } from "@/shared/date";
import type { Announcement } from "@/api/types";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * お知らせ 1 件。押すと本文がその場で開く。
 *
 * ⚠️ 詳細ページへ飛ばさない。お知らせは短いので、遷移を挟むと戻る操作が増えるだけ。
 * ⚠️ 本文はプレーンテキスト。改行はそのまま出す（Markdown は解釈しない）。
 *    書式を足すとレンダリング用のパッケージが要るうえ、本文にリンクを書けるようになり
 *    アプリ外の購入手段へ誘導できてしまう（Guideline 3.1.3(a)）。
 */

/** 種別ごとのバッジ。⚠️ 増やすときは Web の 005_announcements.sql のコメントも直すこと */
const CATEGORY: Record<string, { label: string; fg: string; bg: string }> = {
  info: { label: "お知らせ", fg: color.tealDeeper, bg: color.cyan50 },
  feature: { label: "新機能", fg: color.teal800, bg: color.teal100 },
  maintenance: { label: "メンテナンス", fg: "#854D0E", bg: color.yellow50 },
  incident: { label: "障害", fg: "#C2410C", bg: color.orange100 },
};

/** ⚠️ 知らない category が来ても落とさない。DB は自由入力なので必ず起きうる */
function categoryOf(value: string) {
  return CATEGORY[value] ?? CATEGORY.info;
}

export function AnnouncementRow({
  item,
  /** 既読の線より新しいか。未読だけ左に印を出す */
  unread,
  defaultOpen,
}: {
  item: Announcement;
  unread: boolean;
  /** 先頭の 1 件は開いた状態で出す（開かないと何も読めない画面になるため） */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const meta = categoryOf(item.category);

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setOpen((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.85 }]}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.badgeLabel, { color: meta.fg }]}>{meta.label}</Text>
            </View>
            <Text style={styles.date}>{formatJstDate(item.publishedAt)}</Text>
            {unread && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.title}>{item.title}</Text>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={color.teal}
          style={{ marginTop: 2 }}
        />
      </Pressable>

      {open && (
        <View style={styles.bodyWrap}>
          {/* 改行はそのまま。Text は \n を素直に折り返す */}
          <Text style={styles.body}>{item.body}</Text>
        </View>
      )}
    </Card>
  );
}

/** 1 件も無いとき。⚠️ 審査時にここが出ると機能を確認してもらえない */
export function AnnouncementEmpty() {
  return (
    <Card>
      <Muted>現在お知らせはありません。</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 6 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeLabel: { fontFamily: font.uiBold, fontSize: 10 },
  date: { fontFamily: font.ui, fontSize: 11, color: color.textFaint },
  unreadDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: color.orange500 },
  title: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain, lineHeight: 21 },
  bodyWrap: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  body: { fontFamily: font.ui, fontSize: 14, color: color.textMain, lineHeight: 22 },
});
