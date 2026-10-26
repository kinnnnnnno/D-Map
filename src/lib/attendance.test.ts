import { expect, it } from "vitest";
import { attendanceSummary } from "./attendance";
it("定員ありの参加予定数と残り枠",()=>expect(attendanceSummary(18,30)).toBe("参加予定：18 / 30人（残り12枠）"));
it("定員なしを実際の出席人数と混同しない",()=>expect(attendanceSummary(18,null)).toBe("18人が参加予定・定員なし"));
it("満員の残り枠は0",()=>expect(attendanceSummary(2,2)).toContain("残り0枠"));
