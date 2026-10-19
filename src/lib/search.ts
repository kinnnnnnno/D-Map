import type { DanceEvent, SearchFilters } from "../types/event";
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
  // Date.parseは2月30日などを翌月に補正するため、入力の日付も照合します。
  const calendarDate = Date.parse(`${date}T00:00:00Z`);
  const validTime = (time: string) =>
    !time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(calendarDate) ||
    new Date(calendarDate).toISOString().slice(0, 10) !== date ||
    !validTime(startTime) ||
    !validTime(endTime)
  ) {
    throw new Error("有効な日時を入力してください。");
  }
  const start = Date.parse(`${date}T${startTime || "00:00"}:00+09:00`);
  let end = endTime
    ? Date.parse(`${date}T${endTime}:00+09:00`)
    : Date.parse(`${date}T00:00:00+09:00`) + dayMs;
  if (!Number.isFinite(start) || !Number.isFinite(end))
    throw new Error("有効な日時を入力してください。");
  if (endTime && startTime && endTime === startTime)
    throw new Error("開始時間と終了時間は異なる時刻を指定してください。");
  if (end < start) end += dayMs;
  return { start, end };
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
