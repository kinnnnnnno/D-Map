import { describe, expect, it } from "vitest";
import { legacyEvents as demoEvents } from "../data/legacyEvents.test-fixture";
import { getPublicEvents } from "../services/eventService";
import { emptyFilters, filterEvents, searchWindow } from "./search";
import type { SearchFilters } from "../types/event";
const search = (patch: Partial<SearchFilters>) =>
  filterEvents(demoEvents, { ...emptyFilters, ...patch });
describe("日付・時刻の形式検証", () => {
  it("存在しない日付を補正せず拒否する", () => {
    expect(() => search({ date: "2026-02-30" })).toThrow("有効");
  });
  it("24時や範囲外の分を拒否する", () => {
    expect(() => search({ date: "2026-10-24", startTime: "24:00" })).toThrow(
      "有効",
    );
    expect(() => search({ date: "2026-10-24", endTime: "12:60" })).toThrow(
      "有効",
    );
  });
});
describe("公開境界", () => {
  it("取得口でgroupを除外する", () => {
    expect(getPublicEvents()).toHaveLength(15);
    expect(getPublicEvents().every((e) => e.visibility === "public")).toBe(
      true,
    );
  });
  it("検索側でもgroupを除外する", () => {
    expect(search({}).some((e) => e.visibility === "group")).toBe(false);
  });
});
describe("ジャンル・種別", () => {
  it("無条件では公開7件を開催順で返す", () => {
    const events = search({});
    expect(events).toHaveLength(7);
    expect(events.map((e) => e.startAt)).toEqual(
      events.map((e) => e.startAt).sort(),
    );
  });
  it("ジャンルを絞る", () =>
    expect(search({ genre: "HIP HOP" }).map((e) => e.id)).toEqual(["1"]));
  it("種別を絞る", () =>
    expect(search({ type: "ワークショップ" }).map((e) => e.id)).toEqual([
      "3",
      "6",
    ]));
  it("全条件をANDで結ぶ", () =>
    expect(
      search({
        date: "2026-10-24",
        startTime: "19:00",
        endTime: "21:00",
        genre: "HOUSE",
        type: "セッション",
      }).map((e) => e.id),
    ).toEqual(["2"]));
  it("0件を返せる", () =>
    expect(search({ genre: "HOUSE", type: "バトル" })).toEqual([]));
  it("元の配列を変更しない", () => {
    const ids = demoEvents.map((e) => e.id);
    search({});
    expect(demoEvents.map((e) => e.id)).toEqual(ids);
  });
});
describe("日本時間の区間重複（開始を含む・終了を含まない）", () => {
  it("日付だけなら当日全体", () =>
    expect(search({ date: "2026-10-24" })).toHaveLength(4));
  it("前日開始の深夜イベントも含む", () =>
    expect(
      search({ date: "2026-10-25", startTime: "00:30", endTime: "01:00" }).map(
        (e) => e.id,
      ),
    ).toEqual(["5"]));
  it("検索側も日付をまたげる", () =>
    expect(
      search({ date: "2026-10-24", startTime: "23:30", endTime: "01:00" }).map(
        (e) => e.id,
      ),
    ).toEqual(["5"]));
  it("イベント終了と検索開始が同時なら含まない", () =>
    expect(
      search({ date: "2026-10-25", startTime: "02:00", endTime: "03:00" }),
    ).toEqual([]));
  it("イベント開始と検索終了が同時なら含まない", () =>
    expect(
      search({ date: "2026-10-24", startTime: "22:00", endTime: "23:00" }),
    ).toEqual([]));
  it("同一の区間は重複する", () =>
    expect(
      search({
        date: "2026-10-24",
        startTime: "17:00",
        endTime: "20:00",
        genre: "HIP HOP",
      }),
    ).toHaveLength(1));
  it("終了のみなら当日0時から", () =>
    expect(
      search({ date: "2026-10-25", endTime: "01:00" }).map((e) => e.id),
    ).toEqual(["5"]));
  it("開始のみなら翌日0時まで", () =>
    expect(
      search({ date: "2026-10-24", startTime: "23:00" }).map((e) => e.id),
    ).toEqual(["5"]));
  it("日付なしの時間指定を拒否する", () =>
    expect(() => search({ startTime: "12:00" })).toThrow("日付"));
  it("同時刻の入力を拒否する", () =>
    expect(() =>
      search({ date: "2026-10-24", startTime: "12:00", endTime: "12:00" }),
    ).toThrow("異なる"));
  it("不正な日付を拒否する", () =>
    expect(() => search({ date: "invalid" })).toThrow("有効"));
  it("ブラウザのタイムゾーンに依存しない", () =>
    expect(searchWindow({ ...emptyFilters, date: "2026-10-24" })).toEqual({
      start: Date.parse("2026-10-23T15:00:00Z"),
      end: Date.parse("2026-10-24T15:00:00Z"),
    }));
  it("全デモデータはタイムゾーン付きで開始より終了が後", () => {
    for (const event of demoEvents) {
      expect(event.startAt).toMatch(/\+09:00$/);
      expect(event.endAt).toMatch(/\+09:00$/);
      expect(Date.parse(event.endAt)).toBeGreaterThan(
        Date.parse(event.startAt),
      );
    }
  });
});
