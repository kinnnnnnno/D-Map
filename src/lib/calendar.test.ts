import { describe, expect, it } from "vitest";
import {
  addDays,
  compareDates,
  daysInMonth,
  formatCalendarDate,
  getTodayJst,
  isLeapYear,
  isSelectableDate,
  monthCells,
  parseCalendarDate,
  shiftMonth,
  timeOptions,
  toJstTimestamp,
  weekday,
} from "./calendar";
import { emptyFilters, filterEvents, validateSearchInput } from "./search";
import { legacyEvents as demoEvents } from "../data/legacyEvents.test-fixture";
import type { SearchFilters } from "../types/event";

describe("UI-001 日本時間・暦", () => {
  it("日本時間の深夜0時を境に今日が変わる", () => {
    expect(getTodayJst(new Date("2026-10-18T14:59:59Z"))).toBe("2026-10-18");
    expect(getTodayJst(new Date("2026-10-18T15:00:00Z"))).toBe("2026-10-19");
  });
  it("日本時間の年越し", () =>
    expect(getTodayJst(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01"));
  it("過去日は選択不可、今日・明日は可", () => {
    expect(isSelectableDate("2026-10-18", "2026-10-19")).toBe(false);
    expect(isSelectableDate("2026-10-19", "2026-10-19")).toBe(true);
    expect(isSelectableDate("2026-10-20", "2026-10-19")).toBe(true);
  });
  it("月末・年末を選択できる", () => {
    expect(isSelectableDate("2026-10-31", "2026-10-19")).toBe(true);
    expect(isSelectableDate("2026-12-31", "2026-10-19")).toBe(true);
  });
  it("うるう年は4年・100年・400年規則に従う", () => {
    expect([2024, 2025, 1900, 2000, 2100, 2400].map(isLeapYear)).toEqual([
      true,
      false,
      false,
      true,
      false,
      true,
    ]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
  });
  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-00-01",
    "2026-04-31",
    "2026-01-00",
    "2026-2-01",
    "0000-01-01",
    "invalid",
  ])("不正な日付 %s を排除", (date) => {
    expect(parseCalendarDate(date)).toBeNull();
    expect(isSelectableDate(date, "2026-10-19")).toBe(false);
  });
  it("うるう日を正しく選択する", () => {
    expect(parseCalendarDate("2028-02-29")).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
    expect(parseCalendarDate("2100-02-29")).toBeNull();
  });
  it("月送り・年送りと年またぎ", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(shiftMonth({ year: 2027, month: 1 }, -1)).toEqual({
      year: 2026,
      month: 12,
    });
    expect(shiftMonth({ year: 2026, month: 10 }, 12)).toEqual({
      year: 2027,
      month: 10,
    });
  });
  it("将来年の上限をUIで設けず10000年にも送れる", () => {
    expect(shiftMonth({ year: 9999, month: 12 }, 1)).toEqual({
      year: 10000,
      month: 1,
    });
    expect(isSelectableDate("10000-01-01", "9999-12-31")).toBe(true);
    expect(Number.isFinite(toJstTimestamp("10000-01-01", "00:00"))).toBe(true);
  });
  it("キーボードの日移動は月末・年末・うるう日を越える", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
  it("日曜始まりのカレンダーに不正日を生成しない", () => {
    const cells = monthCells({ year: 2028, month: 2 });
    expect(cells.filter(Boolean)).toHaveLength(29);
    expect(cells).not.toContain("2028-02-30");
    expect(cells.length % 7).toBe(0);
    expect(weekday({ year: 2026, month: 10, day: 19 })).toBe(1);
  });
  it("日付の表記と比較が端末時刻に依存しない", () => {
    expect(formatCalendarDate({ year: 2026, month: 1, day: 2 })).toBe(
      "2026-01-02",
    );
    expect(compareDates("2027-01-01", "2026-12-31")).toBeGreaterThan(0);
  });
  it("時刻は00:00〜23:45の96個、重複なく15分刻み", () => {
    expect(timeOptions).toHaveLength(96);
    expect(new Set(timeOptions).size).toBe(96);
    expect(timeOptions[0]).toBe("00:00");
    expect(timeOptions.at(-1)).toBe("23:45");
    expect(
      timeOptions.every((time, index) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m === index * 15;
      }),
    ).toBe(true);
  });
});
describe("UI-001 入力制約と重複検索の整合性", () => {
  const today = "2026-10-19";
  it("過去日は画面入力の境界でも拒否する", () =>
    expect(() =>
      validateSearchInput({ ...emptyFilters, date: "2026-10-18" }, today),
    ).toThrow("今日以降"));
  it("15分刻み以外を拒否する", () =>
    expect(() =>
      validateSearchInput(
        { ...emptyFilters, date: "2026-10-24", startTime: "12:01" },
        today,
      ),
    ).toThrow("15分"));
  it("同時刻は24時間と解釈せずエラー", () =>
    expect(() =>
      validateSearchInput(
        {
          ...emptyFilters,
          date: "2026-10-24",
          startTime: "12:00",
          endTime: "12:00",
        },
        today,
      ),
    ).toThrow("異なる"));
  it("日付を選ばず時刻だけ指定するとエラー", () =>
    expect(() =>
      validateSearchInput({ ...emptyFilters, startTime: "00:15" }, today),
    ).toThrow("日付"));
  it.each<[Partial<SearchFilters>, string[]]>([
    [{ date: "2026-10-24" }, ["4", "1", "2", "5"]],
    [{ date: "2026-10-24", startTime: "23:00" }, ["5"]],
    [{ date: "2026-10-25", endTime: "01:00" }, ["5"]],
    [{ date: "2026-10-24", startTime: "23:45", endTime: "00:15" }, ["5"]],
    [
      {
        date: "2026-10-25",
        startTime: "00:15",
        endTime: "01:00",
        genre: "POP",
      },
      ["5"],
    ],
  ])("入力 %j が期待する公開イベントに一致", (patch, ids) => {
    const filters = { ...emptyFilters, ...patch };
    validateSearchInput(filters, today);
    expect(filterEvents(demoEvents, filters).map((event) => event.id)).toEqual(
      ids,
    );
  });
  it("JSTで日付が変わった後は昨日の選択を拒否", () =>
    expect(() =>
      validateSearchInput(
        { ...emptyFilters, date: "2026-10-19" },
        "2026-10-20",
      ),
    ).toThrow("今日以降"));
});
