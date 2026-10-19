import { describe, expect, it } from "vitest";
import { getMarkerStyle, groupEventLocations, markerStyles } from "./markers";
import { demoEvents } from "../data/events";
import { emptyFilters, filterEvents } from "./search";
describe("UI-002 ジャンルと凡例の共通定義", () => {
  it.each([
    ["BREAK", "B"],
    ["BREAKING", "B"],
    ["HIP HOP", "H"],
    ["HIPHOP", "H"],
    ["POP", "P"],
    ["LOCK", "L"],
    ["HOUSE", "他"],
    ["WAACK", "他"],
    ["ALL STYLE", "他"],
  ])("%s を文字 %s で識別", (genre, symbol) => {
    const style = getMarkerStyle(genre);
    expect(style.symbol).toBe(symbol);
    expect(markerStyles).toContain(style);
  });
  it("5分類の色と文字はそれぞれ異なり、番号を使わない", () => {
    expect(new Set(markerStyles.map((style) => style.color)).size).toBe(5);
    expect(new Set(markerStyles.map((style) => style.symbol)).size).toBe(5);
    expect(markerStyles.every((style) => !/\d/.test(style.symbol))).toBe(true);
  });
});
describe("UI-002 同一地点を集約", () => {
  it("全公開イベントを失わず同地点一覧にまとめる", () => {
    const result = groupEventLocations(demoEvents);
    expect(result).toHaveLength(6);
    expect(result.flatMap((location) => location.events)).toHaveLength(7);
    expect(
      result
        .find((location) => location.events.length === 2)
        ?.events.map((event) => event.id),
    ).toEqual(["1", "2"]);
  });
  it("絞り込み対象外・非公開のイベントを混ぜない", () => {
    const filtered = filterEvents(demoEvents, {
      ...emptyFilters,
      genre: "HIP HOP",
    });
    expect(
      groupEventLocations(filtered)
        .flatMap((location) => location.events)
        .map((event) => event.id),
    ).toEqual(["1"]);
    expect(
      groupEventLocations(demoEvents)
        .flatMap((location) => location.events)
        .some((event) => event.visibility === "group"),
    ).toBe(false);
  });
  it("0件ならピンも0件", () => expect(groupEventLocations([])).toEqual([]));
  it("入力配列を変更せず、多数の同地点イベントも保持する", () => {
    const input = Array.from({ length: 1000 }, (_, index) => ({
      ...demoEvents[0],
      id: String(index),
    }));
    expect(groupEventLocations(input)[0].events).toHaveLength(1000);
    expect(input).toHaveLength(1000);
    expect(input[0].id).toBe("0");
  });
});
