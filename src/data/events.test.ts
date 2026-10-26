import { describe, expect, it } from "vitest";
import { createDemoEvents, restrictedDemoEvents } from "./events";
import { emptyFilters, filterEvents } from "../lib/search";
import { eventPrefecture, prefectures, regionView } from "./prefectures";
const events = createDemoEvents(new Date("2026-10-18T15:30:00Z"));

describe("UI-012 地域選択の往復と検索・移動先の整合性", () => {
  it("東京→神奈川→東京→全国で、元データを変更せず件数と移動先を切り替える", () => {
    const original = structuredClone(events);
    const cases = [
      ["東京都", 13, [35.681, 139.72]],
      ["神奈川県", 2, [35.45, 139.64]],
      ["東京都", 13, [35.681, 139.72]],
      ["", 15, [36.5, 137]],
    ] as const;
    for (const [prefecture, count, center] of cases) {
      const result = filterEvents(events, { ...emptyFilters, prefectures: prefecture ? [prefecture] : [] });
      expect(result).toHaveLength(count);
      if (prefecture) expect(result.every(event => eventPrefecture(event) === prefecture)).toBe(true);
      expect(regionView(prefecture).center).toEqual(center);
    }
    expect(events).toEqual(original);
  });
});

describe("DATA-001 / UI-010 / UI-011", () => {
  it("15公開件・東京13・神奈川2、既存groupを別途保持", () => {
    expect(events).toHaveLength(15);
    expect(new Set(events.map(event => event.id)).size).toBe(15);
    expect(filterEvents(events, {...emptyFilters,prefectures:["東京都"]})).toHaveLength(13);
    expect(filterEvents(events, {...emptyFilters,prefectures:["神奈川県"]})).toHaveLength(2);
    expect(filterEvents([...events,...restrictedDemoEvents], emptyFilters)).toHaveLength(15);
  });
  it("すべてのジャンルの専用値allと登録ジャンルを区別", () => {
    expect(emptyFilters.genre).toBe("all");
    expect(filterEvents(events, emptyFilters)).toHaveLength(15);
    expect(filterEvents(events, {...emptyFilters,genre:"ALL STYLE"}).map(event=>event.id)).toEqual(["7"]);
    expect(filterEvents(events, {...emptyFilters,genre:"FREESTYLE"}).map(event=>event.id)).toEqual(["12", "16"]);
    expect(new Set(events.map(event=>event.genre))).toEqual(new Set(["HIP HOP","HOUSE","BREAKING","LOCK","POP","WAACK","ALL STYLE","KRUMP","JAZZ","VOGUE","FREESTYLE"]));
  });
  it("allはFREESTYLE・ALL STYLEを含む公開全ジャンルを返す", () => {
    const result = filterEvents([...events, ...restrictedDemoEvents], {...emptyFilters, genre:"all"});
    expect(result).toHaveLength(15);
    expect(new Set(result.map(event=>event.genre))).toEqual(new Set(events.map(event=>event.genre)));
  });
  it("allと複数県・日時を組み合わせても他条件を解除しない", () => {
    const filters = {...emptyFilters, prefectures:["東京都", "神奈川県"] as const, date:"2026-11-01"};
    const result = filterEvents(events, {...filters, prefectures:[...filters.prefectures], genre:"all"});
    expect(result).toHaveLength(8);
    expect(result.filter(event=>event.genre === "FREESTYLE")).toHaveLength(2);
    expect(filterEvents(events, {...emptyFilters, prefectures:["神奈川県"], genre:"all"})).toHaveLength(2);
  });
  it("県・日時・ジャンル・種別をANDで検索、0件も正常", () => {
    expect(filterEvents(events, {...emptyFilters,prefectures:["神奈川県"],date:"2026-11-01",genre:"JAZZ",type:"練習会"}).map(event=>event.id)).toEqual(["15"]);
    expect(filterEvents(events, {...emptyFilters,prefectures:["北海道"]})).toEqual([]);
  });
  it("県情報がない旧データは住所から補完、未知の住所を東京と誤認しない", () => {
    expect(eventPrefecture({address:"神奈川県川崎市"})).toBe("神奈川県");
    expect(eventPrefecture({address:"非公開"})).toBeUndefined();
    expect(filterEvents([{...events[0],prefecture:undefined}], {...emptyFilters,prefectures:["東京都"]})).toHaveLength(1);
  });
  it("47正式名称と全国の代表位置を定義", () => {
    expect(prefectures).toHaveLength(47);
    expect(new Set(prefectures.map(([name])=>name)).size).toBe(47);
    for (const [name,lat,lng] of prefectures) expect(regionView(name).center).toEqual([lat,lng]);
    expect(regionView("").zoom).toBe(5);
  });
  it.each(["2026-10-18T15:30:00Z","2032-02-28T15:30:00Z","2035-12-31T23:00:00Z"])("%sでも日付が過去にならず、区間・深夜の長さを維持", now => {
    const future = createDemoEvents(new Date(now));
    for (const event of future) {
      expect(Date.parse(event.startAt)).toBeGreaterThan(new Date(now).getTime());
      expect(Date.parse(event.endAt)-Date.parse(event.startAt)).toBe(Date.parse(events.find(item=>item.id===event.id)!.endAt)-Date.parse(events.find(item=>item.id===event.id)!.startAt));
      expect(event.startAt).toMatch(/\+09:00$/);
      expect(event.address.startsWith(event.prefecture!)).toBe(true);
    }
    expect(future.find(event=>event.id==="5")!.endAt.slice(0,10)).not.toBe(future.find(event=>event.id==="5")!.startAt.slice(0,10));
  });
});
