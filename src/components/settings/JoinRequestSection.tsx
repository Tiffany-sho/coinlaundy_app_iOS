import { StyleSheet, Text, View } from "react-native";
import { useDecideJoinRequest } from "@/api/queries";
import { Button, Muted } from "@/components/common/ui";
import { useToast } from "@/components/common/toast";
import { orgStyles } from "@/components/settings/orgShared";
import { color, font, spacing, radius } from "@/theme/tokens";
import { formatJstDate } from "@/shared/date";
import type { JoinRequest } from "@/api/types";

/**
 * 届いている参加申請を承認・却下する（013、2026-08-06）。
 *
 * ⚠️ **店舗管理者（admin）にしか出ない。** `GET /org/join-requests` は
 *    admin 以外へ空配列を返すので、呼び出し側は件数だけ見ればよい。
 *    ⚠️ **オーナー限定にしない**（2026-08-06 に owner_id から変えた）。
 *    オーナーは組織を作った 1 人だけで譲渡する手段が無いため、限定すると
 *    **オーナー不在の間は誰も組織に参加できなくなる。**
 *
 * ⚠️ **メンバーが増える経路はこれだけ**になった。メール招待（token 付きリンク）と
 *    参加パスワードは 013 で畳んである。**「招待する」を足し直さないこと。**
 *    足すと人数制限の判定が 2 か所に分かれる。
 */
export function JoinRequestSection({ requests }: { requests: JoinRequest[] }) {
  return (
    <>
      <View style={orgStyles.separator} />
      <Text style={orgStyles.sectionTitle}>参加申請（{requests.length}件）</Text>
      <Muted style={styles.note}>
        権限を選んで承認すると、その人が組織に加わります。
      </Muted>
      <View style={{ gap: spacing.sm }}>
        {requests.map((request) => (
          <RequestRow key={request.id} request={request} />
        ))}
      </View>
    </>
  );
}

function RequestRow({ request }: { request: JoinRequest }) {
  const toast = useToast();
  const decide = useDecideJoinRequest();

  /*
    ⚠️ **成否どちらもトーストを出す。** 承認はメンバーが増える操作なので、
       黙って終わると「押せたのか」が分からない。
    ⚠️ **却下では `role` を送らない。** サーバは reject のとき role を見ないが、
       送ると「却下したのに権限を選んだ」という読み方ができてしまう。
  */
  function run(decision: "approve" | "reject", role?: "collecter" | "viewer") {
    decide.mutate(
      { id: request.id, decision, role },
      {
        onSuccess: () =>
          toast.success(
            decision === "approve" ? `${request.name} さんを追加しました` : "申請を却下しました"
          ),
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "処理できませんでした"),
      }
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{request.name}</Text>
      {/* ⚠️ epoch ミリ秒。`new Date(<文字列>)` を通さない（Hermes で NaN になる） */}
      <Muted style={styles.date}>{formatJstDate(request.createdAt)} 申請</Muted>

      {/*
        ⚠️ **承認は権限とセットで押させる。**「承認」だけにすると、あとから
           メンバー管理で権限を直す手間が必ず発生する。
        ⚠️ **`admin` を選ばせない。** 承認だけで管理者を増やせてしまう。
           昇格はメンバー管理から行う。
      */}
      <View style={styles.actions}>
        <Button
          label="集金担当者として承認"
          variant="gradient"
          onPress={() => run("approve", "collecter")}
          loading={decide.isPending}
        />
        <Button
          label="閲覧者として承認"
          variant="primary"
          onPress={() => run("approve", "viewer")}
          disabled={decide.isPending}
        />
        <Button
          label="却下"
          variant="danger"
          onPress={() => run("reject")}
          disabled={decide.isPending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, marginBottom: spacing.sm },
  card: {
    backgroundColor: color.orange100,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.orange200,
    padding: spacing.md,
    gap: 2,
  },
  name: { fontFamily: font.uiBold, fontSize: 15, color: color.textMain },
  date: { fontSize: 11 },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
