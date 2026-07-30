import { Fragment } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  LEGAL_DOCUMENTS,
  isLegalPageKey,
  type LegalBlock,
  type LegalSection,
} from "@/content/legal";
import { Card, Screen } from "@/components/common/ui";
import { color, font, radius, spacing, HIT_SIZE } from "@/theme/tokens";

/**
 * 利用規約・プライバシーポリシー。
 *
 * ⚠️ **以前は Web を WebView で開いていた（app/settings/webview.tsx）。2026-07-30 に
 *    アプリ内で描く形へ変えた。** Web 側の /app/terms は静的なテキストなのに
 *    `Cache-Control: no-store` で毎回サーバ生成され（middleware が Supabase の
 *    セッション更新を通すため）、開くたびに 0.3〜1.0 秒かかっていた。
 *    そこへ 95KB の HTML と JS 20 本が続くので、実機では体感でさらに遅い。
 *
 * ⚠️ **引き換えに法務文書がアプリと Web の 2 か所になった。**
 *    同期の義務は src/content/legal/types.ts の先頭に書いてある。
 *
 * ⚠️ この画面は**外部へのリンクを一切持たない。** WebView 時代は許可リストで
 *    他ページへの遷移を止めていたが、その役目はテキストを持つことで無くなった。
 *    メールアドレスや電話番号も**リンクにしない**（mailto: / tel: で外へ出さない）。
 */
export default function Legal() {
  const { page } = useLocalSearchParams<{ page?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // 不正な値でも落とさず規約に倒す（通知やディープリンクから来ることがある）
  const doc = LEGAL_DOCUMENTS[isLegalPageKey(page) ? page : "terms"];

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={color.teal} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {doc.title}
        </Text>
        {/* 見出しを中央に置くための釣り合い。戻るボタンと同じ幅の空き */}
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
        }}
      >
        <Text style={styles.lead}>{doc.lead}</Text>

        <Card style={{ marginTop: spacing.lg, gap: spacing.xl }}>
          {doc.sections.map((section) => (
            <Section key={section.heading} section={section} />
          ))}
        </Card>

        <Text style={styles.established}>{doc.establishedAt}</Text>
      </ScrollView>
    </Screen>
  );
}

function Section({ section }: { section: LegalSection }) {
  return (
    <View>
      <Text style={styles.heading}>{section.heading}</Text>
      {section.blocks.map((block, i) => (
        <Fragment key={i}>
          <Block block={block} />
        </Fragment>
      ))}
    </View>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "paragraph":
      return <Text style={styles.paragraph}>{block.text}</Text>;

    case "list":
      return (
        <View style={styles.list}>
          {block.items.map((item) => (
            /* ⚠️ 「・」を本文に含めず別の Text にする。含めると 2 行目以降が
                  中黒の下へ回り込んでぶら下げが崩れる */
            <View key={item} style={styles.listItem}>
              <Text style={styles.bullet}>・</Text>
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      );

    case "definitions":
      return (
        <View style={styles.definitions}>
          {block.items.map((item) => (
            <View key={item.term}>
              <Text style={styles.term}>{item.term}</Text>
              <Text style={styles.paragraph}>{item.description}</Text>
            </View>
          ))}
        </View>
      );

    case "contact":
      return (
        <View style={styles.contact}>
          <Text style={styles.contactName}>{block.name}</Text>
          {block.lines.map((line) => (
            <Text key={line} style={styles.contactLine}>
              {line}
            </Text>
          ))}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: color.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  headerButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: font.uiBold,
    fontSize: 17,
    color: color.textMain,
  },
  lead: { fontFamily: font.ui, fontSize: 13, lineHeight: 21, color: color.textMuted },
  heading: {
    fontFamily: font.uiBold,
    fontSize: 15,
    color: color.tealDeeper,
    marginBottom: spacing.sm,
  },
  paragraph: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 21,
    color: color.textMuted,
    marginBottom: spacing.sm,
  },
  list: { gap: 2 },
  listItem: { flexDirection: "row" },
  bullet: { fontFamily: font.ui, fontSize: 13, lineHeight: 21, color: color.textMuted },
  listText: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 21,
    color: color.textMuted,
  },
  definitions: { gap: spacing.md },
  term: { fontFamily: font.uiBold, fontSize: 13, color: color.textMain, marginBottom: 2 },
  contact: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: color.appBg,
    marginTop: spacing.xs,
  },
  contactName: { fontFamily: font.ui, fontSize: 13, color: color.textMain },
  contactLine: { fontFamily: font.ui, fontSize: 13, lineHeight: 21, color: color.textMuted },
  established: {
    fontFamily: font.ui,
    fontSize: 11,
    color: color.textFaint,
    textAlign: "right",
    marginTop: spacing.lg,
  },
});
