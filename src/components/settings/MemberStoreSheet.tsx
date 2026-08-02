import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSetMemberStores } from "@/api/queries";
import { useToast } from "@/components/common/toast";
import { Button, Muted } from "@/components/common/ui";
import { errorMessage } from "@/components/funds/fundCache";
import { color, font, radius, spacing } from "@/theme/tokens";
import type { OrgMember, Store } from "@/api/types";

/**
 * 担当店舗を選ぶシート（011）。Web の `MemberStoreAssign.jsx` に当たる。
 *
 * ⚠️ **管理者には出さない。** 管理者は常に全店舗で `member_stores` に行を持たない。
 *    出すと「未設定」に見えるうえ、保存しようとするとサーバが 400 を返す。
 *
 * ⚠️ **0 件のまま保存できるようにしておく。** 担当を全部外す＝その人は集金も
 *    在庫も何も見えなくなる、という**意図した操作**があるため
 *    （辞めた人を閲覧者にして担当を外す、など）。押す前に確かめる文言は出す。
 *
 * ⚠️ **保存は置き換え。** 画面に出ている状態がそのまま次の担当になる。
 */
export function MemberStoreSheet({
  member,
  stores,
  onClose,
}: {
  /** null で閉じる。⚠️ 開くたびに作り直したいので、下の key で分けている */
  member: OrgMember | null;
  stores: Store[];
  onClose: () => void;
}) {
  return (
    <Modal visible={Boolean(member)} animationType="slide" transparent onRequestClose={onClose}>
      {member && (
        /* ⚠️ key を付けて開くたびに作り直す。中の選択は useState の初期値で
              持っているので、作り直さないと前に開いた人の選択が残る */
        <SheetBody key={member.user_id} member={member} stores={stores} onClose={onClose} />
      )}
    </Modal>
  );
}

function SheetBody({
  member,
  stores,
  onClose,
}: {
  member: OrgMember;
  stores: Store[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const setStores = useSetMemberStores();
  /* ⚠️ 古い応答には storeIds が無い（永続キャッシュ）。`?? []` を通す */
  const [selected, setSelected] = useState<string[]>(member.storeIds ?? []);

  const name = member.profiles.username || member.profiles.full_name || "このメンバー";

  const toggle = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  async function save() {
    try {
      await setStores.mutateAsync({ userId: member.user_id, laundryIds: selected });
      toast.success(
        selected.length === 0
          ? `${name}の担当店舗をすべて解除しました`
          : `${name}の担当店舗を更新しました`
      );
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "担当店舗を更新できませんでした"));
    }
  }

  return (
    /* ⚠️ 背景と本体は兄弟にする（docs/traps.md のシートの節）。上限は親に持たせ、
          ScrollView は残りを埋めるだけにしないと 1 回目のスクロールが空振りする */
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />

        <Text style={styles.title}>{name}の担当店舗</Text>
        <Muted style={styles.note}>
          選んだ店舗の集金と在庫だけを扱えます。選ばれていない店舗は一覧にも出ません。
        </Muted>

        {stores.length === 0 ? (
          <Muted style={{ marginTop: spacing.lg }}>店舗がまだありません</Muted>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.sm }}>
            {stores.map((store) => {
              const on = selected.includes(store.id);
              return (
                <Pressable
                  key={store.id}
                  onPress={() => toggle(store.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [
                    styles.row,
                    on && styles.rowOn,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Ionicons
                    name={on ? "checkbox" : "square-outline"}
                    size={20}
                    color={on ? color.teal : color.textFaint}
                  />
                  <Text style={[styles.rowLabel, on && styles.rowLabelOn]}>{store.store}店</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* ⚠️ 0 件で保存できることは伝える。押してから気づくのでは遅い */}
        {selected.length === 0 && stores.length > 0 && (
          <Text style={styles.warn}>
            このまま保存すると、{name}は集金も在庫も何も見られなくなります。
          </Text>
        )}

        {/* ⚠️ 新しく作った店舗は自動で配られない。ここで気づけるようにする */}
        <Muted style={styles.hint}>
          店舗を新しく登録しても自動では割り当てられません。ここで選び直してください。
        </Muted>

        <View style={styles.actions}>
          <Button label="やめる" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="保存"
            variant="gradient"
            onPress={save}
            loading={setStores.isPending}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    /* ⚠️ 上限は**親**に持たせる。ScrollView に maxHeight を付けると
          1 回目の指が空振りする（docs/traps.md） */
    maxHeight: "88%",
    backgroundColor: color.cardBg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.divider,
    marginBottom: spacing.md,
  },
  title: { fontFamily: font.uiBold, fontSize: 17, color: color.textMain },
  note: { fontSize: 12, marginTop: 2 },
  list: { flexShrink: 1, marginTop: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.appBg,
  },
  rowOn: { borderColor: color.cyan400, backgroundColor: color.cyan50 },
  rowLabel: { fontFamily: font.ui, fontSize: 15, color: color.textMain },
  rowLabelOn: { fontFamily: font.uiBold, color: color.tealDeeper },
  warn: {
    fontFamily: font.ui,
    fontSize: 12,
    color: color.orange500,
    marginTop: spacing.md,
  },
  hint: { fontSize: 11, marginTop: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
});
