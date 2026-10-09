import { StyleSheet, Switch, Text, View } from "react-native";
import { useUpdateOrgExpensesEnabled } from "@/api/queries";
import { useDialog } from "@/components/common/dialog";
import { useToast } from "@/components/common/toast";
import { errorText, orgStyles } from "@/components/settings/orgShared";
import { color, font, radius, spacing } from "@/theme/tokens";

/**
 * 経費を記録するかの切り替え（012）。初期設定で聞いた答えをここで変えられる。
 *
 * ⚠️ **admin だけに出す。** 組織全員の収益ページの見え方が変わるため。
 *    サーバも admin 以外を弾くので、出すと「押せるのに失敗する」になる。
 *
 * ⚠️ **切っても経費のデータは消えない。** これは表示の設定で、戻せば以前の
 *    記録がそのまま出る。**その旨を必ず画面に書く**（消えると思われると、
 *    切り替えるのが怖くて誰も触れなくなる）。
 */
export function ExpensesSection({ enabled, canEdit }: { enabled: boolean; canEdit: boolean }) {
  const dialog = useDialog();
  const toast = useToast();
  const update = useUpdateOrgExpensesEnabled();

  async function onChange(next: boolean) {
    /*
      ⚠️ 切るときだけ確かめる。組織の全員の画面から経費が消えるので、
         指が当たっただけで消えるのは重すぎる。**入れるときは確認しない**
         （増える方向なので取り返しがつく）。
    */
    if (!next) {
      const ok = await dialog.confirm({
        title: "経費の記録をやめますか？",
        message:
          "収益ページから「月別利益」と経費の入口が消えます。登録済みの経費は消えないので、いつでも元に戻せます。",
        confirmLabel: "やめる",
        cancelLabel: "続ける",
      });
      if (!ok) return;
    }

    update.mutate(next, {
      onSuccess: () =>
        toast.success(next ? "経費を記録します" : "経費の記録をやめました"),
      onError: (e) => toast.error(errorText(e, "設定を変更できませんでした")),
    });
  }

  return (
    <View>
      <Text style={orgStyles.sectionTitle}>経費</Text>
      <View style={styles.box}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>経費を記録する</Text>
            <Text style={styles.note}>
              家賃・仕入れなどの支出を登録すると、収益ページに「月別利益」が出ます。
            </Text>
          </View>
          {/*
            ⚠️ **`isPending` で disabled にしない。** 応答を待つ間トグルが
               動かないと「固まってから切り替わる」ように見える（通知設定と同じ）。
            ⚠️ ただしこちらは楽観的更新をしていないので、値は bootstrap が
               返るまで前のまま。**確認ダイアログを挟むぶん誤操作は起きにくい。**
          */}
          <Switch
            value={enabled}
            disabled={!canEdit}
            onValueChange={(value) => void onChange(value)}
            trackColor={{ true: color.teal, false: color.divider }}
          />
        </View>

        {!canEdit && (
          <Text style={styles.note}>変更できるのは管理者だけです。</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: color.tealPale,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.cyan100,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  label: { fontFamily: font.uiBold, fontSize: 15, color: color.tealDeeper },
  note: { fontFamily: font.ui, fontSize: 11, lineHeight: 16, color: color.textMuted, marginTop: 2 },
});
