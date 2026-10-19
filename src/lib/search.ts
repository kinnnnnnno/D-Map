import type { DanceEvent, SearchFilters } from "../types/event";
import {
  isSelectableDate,
  parseCalendarDate,
  timeOptions,
  toJstTimestamp,
} from "./calendar";
export const emptyFilters: SearchFilters = {
  date: "",
  startTime: "",
  endTime: "",
  genre: "",
  type: "",
};
const dayMs = 86400000;
export function searchWindow(
  filters: SearchFilters,
): { start: number; end: number } | null {
  const { date, startTime, endTime } = filters;
  if (!date) {
    if (startTime || endTime)
      throw new Error("時間を指定する場合は、日付も選択してください。");
    return null;
  }
  const validTime = (time: string) =>
    !time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (
    !parseCalendarDate(date) ||
    !validTime(startTime) ||
    !validTime(endTime)
  ) {
    throw new Error("有効な日時を入力してください。");
  }
  const start = toJstTimestamp(date, startTime || "00:00");
  let end = endTime
    ? toJstTimestamp(date, endTime)
    : toJstTimestamp(date, "00:00") + dayMs;
  if (!Number.isFinite(start) || !Number.isFinite(end))
    throw new Error("有効な日時を入力してください。");
  if (endTime && startTime && endTime === startTime)
    throw new Error("開始時間と終了時間は異なる時刻を指定してください。");
  if (end < start) end += dayMs;
  return { start, end };
}
/** 画面入力の制約。過去のデータを検証する検索関数自体には「今日」を埋め込みません。 */
export function validateSearchInput(
  filters: SearchFilters,
  today: string,
): void {
  if (filters.date && !isSelectableDate(filters.date, today))
    throw new Error("今日以降の日付を選択してください（日本時間）。");
  if (
    [filters.startTime, filters.endTime].some(
      (time) => time && !timeOptions.includes(time),
    )
  )
    throw new Error("時刻は15分単位で選択してください。");
  searchWindow(filters);
}
export function filterEvents(
  events: DanceEvent[],
  filters: SearchFilters,
): DanceEvent[] {
  const window = searchWindow(filters);
  return events
    .filter(
      (event) =>
        event.visibility === "public" &&
        (!filters.genre || event.genre === filters.genre) &&
        (!filters.type || event.type === filters.type) &&
        // 開始を含み、終了を含まない区間。同じ時刻に接するだけなら一致しません。
        (!window ||
          (Date.parse(event.startAt) < window.end &&
            Date.parse(event.endAt) > window.start)),
    )
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}
