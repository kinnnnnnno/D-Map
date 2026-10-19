import { describe, expect, it } from "vitest";
import { clusterLocations } from "./clusters";
import { groupEventLocations } from "./markers";
import { denseEvents } from "../../e2e/fixtures/denseEvents";
import { emptyFilters, filterEvents } from "./search";
const project = (location: { latitude: number; longitude: number }) => ({
  x: location.longitude * 10000,
  y: location.latitude * 10000,
});
describe("UI-004 表示距離による集約", () => {
  it("5件の同一地点と近接10件を15イベントとして数え、遠い1件を分離する", () => {
    const groups = clusterLocations(groupEventLocations(denseEvents), project);
    expect(
      groups.map((group) => group.eventCount).sort((a, b) => a - b),
    ).toEqual([1, 15]);
    expect(groups.reduce((sum, group) => sum + group.eventCount, 0)).toBe(16);
    expect(
      new Set(
        groups.flatMap((group) =>
          group.locations.flatMap((location) =>
            location.events.map((event) => event.id),
          ),
        ),
      ).size,
    ).toBe(16);
  });
  it("同じ座標の5件を1地点として保持する", () => {
    const groups = clusterLocations(
      groupEventLocations(
        denseEvents.filter((event) => event.id.startsWith("same-")),
      ),
      project,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].locations).toHaveLength(1);
    expect(groups[0].eventCount).toBe(5);
  });
  it("拡大に相当する投影では近接地点を分離しても全件を失わない", () => {
    const groups = clusterLocations(
      groupEventLocations(denseEvents),
      (location) => ({
        x: location.longitude * 10000000,
        y: location.latitude * 10000000,
      }),
    );
    expect(groups).toHaveLength(12);
    expect(groups.reduce((sum, group) => sum + group.eventCount, 0)).toBe(16);
  });
  it("異なるジャンルを同じ地域に含んでも件数・ジャンルを保持する", () => {
    const largest = clusterLocations(
      groupEventLocations(denseEvents),
      project,
    ).find((group) => group.eventCount === 15)!;
    expect(
      new Set(
        largest.locations.flatMap((location) =>
          location.events.map((event) => event.genre),
        ),
      ).size,
    ).toBe(5);
  });
  it("検索で除外したイベントが集約に残らない", () => {
    const events = filterEvents(denseEvents, {
      ...emptyFilters,
      type: "セッション",
      genre: "HIP HOP",
    });
    const groups = clusterLocations(groupEventLocations(events), project);
    expect(groups.reduce((sum, group) => sum + group.eventCount, 0)).toBe(2);
    expect(
      groups
        .flatMap((group) =>
          group.locations.flatMap((location) =>
            location.events.map((event) => event.id),
          ),
        )
        .sort(),
    ).toEqual(events.map((event) => event.id).sort());
  });
  it("0件は集約0件", () => expect(clusterLocations([], project)).toEqual([]));
  it("表示距離の境界とセル境界をまたぐ近接を判定する", () => {
    const base = groupEventLocations(denseEvents).slice(0, 2);
    const positions = new Map([
      [base[0].key, { x: 55, y: -1 }],
      [base[1].key, { x: 111, y: -1 }],
    ]);
    expect(
      clusterLocations(base, (location) => positions.get(location.key)!).length,
    ).toBe(1);
    positions.set(base[1].key, { x: 111.1, y: -1 });
    expect(
      clusterLocations(base, (location) => positions.get(location.key)!).length,
    ).toBe(2);
  });
  it("連鎖して近接する地点を1グループにし、元配列を変更しない", () => {
    const locations = groupEventLocations(denseEvents).slice(0, 3);
    const ids = locations.map((location) => location.key);
    expect(
      clusterLocations(locations, (location) => ({
        x: ids.indexOf(location.key) * 50,
        y: 0,
      })),
    ).toHaveLength(1);
    expect(locations.map((location) => location.key)).toEqual(ids);
  });
  it("検索順が変わっても同じ構成なら再利用キーが同じ", () => {
    const locations = groupEventLocations(denseEvents);
    expect(
      clusterLocations(locations, project)
        .map((group) => group.key)
        .sort(),
    ).toEqual(
      clusterLocations([...locations].reverse(), project)
        .map((group) => group.key)
        .sort(),
    );
  });
  it("不正な半径は拒否する", () =>
    expect(() => clusterLocations([], project, 0)).toThrow("半径"));
});
