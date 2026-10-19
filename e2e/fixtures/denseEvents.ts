import type { DanceEvent } from "../../src/types/event";
const genres = ["HIP HOP", "BREAKING", "POP", "LOCK", "HOUSE"] as const;
function makeEvent(
  id: string,
  index: number,
  latitude: number,
  longitude: number,
  type: DanceEvent["type"],
): DanceEvent {
  return {
    id,
    title: `テスト専用イベント ${id}`,
    genre: genres[index % genres.length],
    type,
    startAt: "2026-10-24T18:00:00+09:00",
    endAt: "2026-10-24T21:00:00+09:00",
    venueName: "テスト専用・架空会場",
    address: "東京都内（架空）",
    latitude,
    longitude,
    feeYen: 0,
    organizerName: "テスト専用主催者",
    participationRule: "自動テスト専用",
    description: `${id}の説明。実際の募集はありません。`,
    visibility: "public",
  };
}
/** 通常画面のデータに混ぜない、テスト専用の5+10+1件。 */
export const denseEvents: DanceEvent[] = [
  ...Array.from({ length: 5 }, (_, i) =>
    makeEvent(`same-${i + 1}`, i, 35.664, 139.7, "練習会"),
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    makeEvent(
      `near-${i + 1}`,
      i,
      35.664 + ((i % 3) + 1) * 0.00006,
      139.7 + (i + 1) * 0.00008,
      "セッション",
    ),
  ),
  makeEvent("far-1", 0, 35.66, 139.3, "ワークショップ"),
];
