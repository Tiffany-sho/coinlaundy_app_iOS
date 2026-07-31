import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Chip } from "@/components/common/Chip";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { color, font, spacing } from "@/theme/tokens";
import type { RegionOption } from "@/components/stores/prefecture";

/** 「すべて」を表すタブの値。⚠️ 都道府県名と衝突しない文字列にすること */
const ALL = "__all__";

/**
 * タブに出しておく都道府県の数。これを超えたぶんは折りたたむ。
 * ⚠️ 「すべて」を足して 4 タブになる。スマホ幅で 1 行に収まる上限がここ
 *    （SegmentedTabs は flex 均等割りなので、5 つ入れると 4 文字の県名が折り返す）。
 */
const VISIBLE_COUNT = 3;

/**
 * 店舗一覧の地域（都道府県）絞り込み。
 *
 * ⚠️ **店舗名順の代わり。** 店名にフリガナが無いため漢字の並び替えが読み順にならず、
 *    「店舗名順が効かない」ように見える。地域で絞るほうが巡回の実務に合う。
 *
 * ⚠️ 都道府県が 4 つ以上あるときの「その他の地域」は、
 *    **そこに選択中のものがある間は閉じない**（閉じると何で絞っているか画面から消える）。
 *    その間は開閉ボタンを出さない。押しても閉じないボタンを置くより分かりやすい。
 */
export function RegionFilter({
  options,
  value,
  onChange,
}: {
  /** 店舗数の多い順（buildRegionOptions の戻り値をそのまま渡す） */
  options: RegionOption[];
  /** null = すべて */
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const visible = options.slice(0, VISIBLE_COUNT);
  const rest = options.slice(VISIBLE_COUNT);

  const activeIsHidden = value !== null && rest.some((option) => option.value === value);
  const showRest = expanded || activeIsHidden;

  const tabs = [
    { value: ALL, label: "すべて" },
    ...visible.map((option) => ({ value: option.value, label: option.label })),
  ];

  return (
    <View>
      <SegmentedTabs
        options={tabs}
        // 隠れているものを選んでいる間は、どのタブも押されていない状態にする
        value={activeIsHidden ? "" : (value ?? ALL)}
        onChange={(next) => onChange(next === ALL ? null : next)}
        style={{ marginBottom: rest.length > 0 ? spacing.sm : 0 }}
      />

      {rest.length > 0 && (
        <>
          {showRest && (
            <View style={styles.chipRow}>
              {rest.map((option) => {
                const selected = option.value === value;
                return (
                  <Chip
                    key={option.value}
                    label={option.label}
                    count={option.count}
                    selected={selected}
                    // もう一度押したら解除。タブ側に「すべて」があるので迷子にならない
                    onPress={() => onChange(selected ? null : option.value)}
                  />
                );
              })}
            </View>
          )}

          {/* ⚠️ 隠れている地域を選んでいる間は出さない（押しても閉じられないため） */}
          {!activeIsHidden && (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setExpanded((prev) => !prev);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: showRest }}
              hitSlop={6}
              style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.toggleLabel}>
                {showRest ? "閉じる" : `他 ${rest.length} 地域`}
              </Text>
              <Ionicons
                name={showRest ? "chevron-up" : "chevron-down"}
                size={14}
                color={color.teal}
              />
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  /* ⚠️ minHeight + hitSlop で 44pt 以上の当たりを作る（文字だけでは押せない） */
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 32,
    marginTop: spacing.xs,
  },
  toggleLabel: { fontFamily: font.uiBold, fontSize: 11, color: color.teal },
});
