/** 日付は端末のタイムゾーンを持たない年月日として計算します。 */
export interface CalendarMonth {
  year: number;
  month: number;
}
export interface CalendarDate extends CalendarMonth {
  day: number;
}
export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
export function daysInMonth(year: number, month: number): number {
  return month === 2
    ? isLeapYear(year)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;
}
export function formatCalendarDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function parseCalendarDate(value: string): CalendarDate | null {
  if (!/^\d{4,}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (
    !Number.isSafeInteger(year) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  )
    return null;
  return { year, month, day };
}
export function compareDates(a: string, b: string): number {
  const left = parseCalendarDate(a),
    right = parseCalendarDate(b);
  if (!left || !right) throw new Error("有効な日付を指定してください。");
  return (
    left.year - right.year || left.month - right.month || left.day - right.day
  );
}
export function isSelectableDate(value: string, today: string): boolean {
  return parseCalendarDate(value) !== null && compareDates(value, today) >= 0;
}
export function getTodayJst(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
export function shiftMonth(
  current: CalendarMonth,
  delta: number,
): CalendarMonth {
  const total = current.year * 12 + current.month - 1 + delta;
  return {
    year: Math.floor(total / 12),
    month: (((total % 12) + 12) % 12) + 1,
  };
}
export function addDays(value: string, amount: number): string {
  const current = parseCalendarDate(value);
  if (!current) throw new Error("有効な日付を指定してください。");
  current.day += amount;
  while (current.day > daysInMonth(current.year, current.month)) {
    current.day -= daysInMonth(current.year, current.month);
    Object.assign(current, shiftMonth(current, 1));
  }
  while (current.day < 1) {
    Object.assign(current, shiftMonth(current, -1));
    current.day += daysInMonth(current.year, current.month);
  }
  return formatCalendarDate(current);
}
// グレゴリオ暦の曜日計算。Date.UTCの「0〜99年の補正」に依存しません。
export function weekday({ year, month, day }: CalendarDate): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  return (
    (y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      offsets[month - 1] +
      day) %
    7
  );
}
export function monthCells(month: CalendarMonth): (string | null)[] {
  const cells: (string | null)[] = Array(weekday({ ...month, day: 1 })).fill(
    null,
  );
  for (let day = 1; day <= daysInMonth(month.year, month.month); day++)
    cells.push(formatCalendarDate({ ...month, day }));
  while (cells.length % 7) cells.push(null);
  return cells;
}
export const timeOptions = Array.from(
  { length: 96 },
  (_, index) =>
    `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`,
);

/** ISO 8601は10000年以降を符号付き6桁以上で表現します。UIに将来年の上限は置きません。 */
export function toJstTimestamp(date: string, time: string): number {
  const parsed = parseCalendarDate(date);
  if (!parsed) return NaN;
  const isoDate =
    parsed.year > 9999
      ? `+${String(parsed.year).padStart(6, "0")}${date.slice(date.indexOf("-"))}`
      : date;
  return Date.parse(`${isoDate}T${time}:00+09:00`);
}
