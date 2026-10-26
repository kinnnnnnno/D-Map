import { describe, expect, it } from "vitest";
import { createDemoEvents } from "../data/events";
import type { Prefecture } from "../data/prefectures";
import { emptyFilters, filterEvents } from "./search";
import { findPrefectures, prefectureSummary, togglePrefecture } from "./prefectureSelection";
const events = createDemoEvents(new Date("2026-10-18T15:30:00Z"));

describe("UI-014 都道府県のOR検索", () => {
  it.each<{ names: Prefecture[]; count: number }>([
    { names: ["東京都"], count: 13 }, { names: ["神奈川県"], count: 2 },
    { names: ["東京都", "神奈川県"], count: 15 }, { names: [], count: 15 },
    { names: ["東京都", "千葉県"], count: 13 }, { names: ["千葉県", "埼玉県"], count: 0 },
  ])("$names で$count 件", ({ names, count }) => {
    expect(filterEvents(events, { ...emptyFilters, prefectures: names })).toHaveLength(count);
  });
  it("ジャンル・日時・種別とはAND、非公開は常に除外", () => {
    const filters = { ...emptyFilters, prefectures: ["東京都", "神奈川県"] as Prefecture[] };
    expect(filterEvents(events, { ...filters, genre: "JAZZ" })).toHaveLength(2);
    expect(filterEvents(events, { ...filters, date: "2026-11-01" })).toHaveLength(8);
    expect(filterEvents(events, { ...filters, date: "2026-11-01", genre: "JAZZ", type: "練習会" }).map(event => event.id)).toEqual(["15"]);
    expect(filterEvents([{ ...events[0], visibility: "group" }], filters)).toEqual([]);
  });
});
describe("UI-014 チェックと検索・要約", () => {
  it("全国から1県、追加、解除、最後の解除で全国へ戻る（入力は不変）", () => {
    const initial: Prefecture[] = [];
    const tokyo = togglePrefecture(initial, "東京都");
    const both = togglePrefecture(tokyo, "神奈川県");
    expect(both).toEqual(["東京都", "神奈川県"]);
    expect(togglePrefecture(both, "東京都")).toEqual(["神奈川県"]);
    expect(togglePrefecture(tokyo, "東京都")).toEqual([]);
    expect(initial).toEqual([]);
    expect(tokyo).toEqual(["東京都"]);
  });
  it("空白・部分一致で検索、存在しない県なら0、空欄なら47件", () => {
    expect(findPrefectures(" 神奈 ").map(([name]) => name)).toEqual(["神奈川県"]);
    expect(findPrefectures("京").map(([name]) => name)).toEqual(["東京都", "京都府"]);
    expect(findPrefectures("架空県")).toEqual([]);
    expect(findPrefectures("")).toHaveLength(47);
  });
  it("全国・県名・複数件数を表示", () => {
    expect(prefectureSummary([])).toBe("全国");
    expect(prefectureSummary(["東京都"])).toBe("東京都");
    expect(prefectureSummary(["東京都", "神奈川県"])).toBe("東京都・神奈川県");
    expect(prefectureSummary(["東京都", "神奈川県", "千葉県"])).toContain("3都道府県");
  });
});
