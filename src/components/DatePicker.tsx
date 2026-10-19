import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  compareDates,
  daysInMonth,
  formatCalendarDate,
  isSelectableDate,
  monthCells,
  parseCalendarDate,
  shiftMonth,
  weekday,
  type CalendarMonth,
} from "../lib/calendar";

export function DatePicker({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<CalendarMonth>(
    () => parseCalendarDate(value || today)!,
  );
  const [focusDate, setFocusDate] = useState(value || today);
  const todayParts = parseCalendarDate(today)!;
  const cells = monthCells(month);
  useEffect(() => {
    if (open)
      calendar.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)
        ?.focus();
  }, [open, focusDate]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(date: string) {
    if (!isSelectableDate(date, today)) return;
    onChange(date);
    close();
  }
  function moveMonth(delta: number) {
    const target = shiftMonth(month, delta);
    const first = formatCalendarDate({ ...target, day: 1 });
    const next = compareDates(first, today) < 0 ? today : first;
    setMonth(parseCalendarDate(next)!);
    setFocusDate(next);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const parsed = parseCalendarDate(date)!;
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday(parsed),
      End: 6 - weekday(parsed),
    };
    let next: string;
    if (event.key in offsets) next = addDays(date, offsets[event.key]);
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const nextMonth = shiftMonth(parsed, event.key === "PageUp" ? -1 : 1);
      next = formatCalendarDate({
        ...nextMonth,
        day: Math.min(parsed.day, daysInMonth(nextMonth.year, nextMonth.month)),
      });
    } else return;
    event.preventDefault();
    if (!isSelectableDate(next, today)) next = today;
    setMonth(parseCalendarDate(next)!);
    setFocusDate(next);
  }
  return (
    <div className="date-picker">
      <span className="field-label" id={`${id}-label`}>
        日付 <small>日本時間 / JST</small>
      </span>
      <button
        type="button"
        className="date-trigger"
        ref={trigger}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
        onClick={() => {
          if (open) return close();
          const next = isSelectableDate(value, today) ? value : today;
          setMonth(parseCalendarDate(next)!);
          setFocusDate(next);
          setOpen(true);
        }}
      >
        <span id={`${id}-value`}>
          {value ? value.replaceAll("-", " / ") : "カレンダーから選択"}
        </span>
        <span aria-hidden="true">▦</span>
      </button>
      {open && (
        <div
          className="calendar"
          id={`${id}-calendar`}
          ref={calendar}
          role="group"
          aria-label="日付カレンダー"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="calendar-nav">
            <button
              type="button"
              aria-label="前年へ"
              disabled={month.year <= todayParts.year}
              onClick={() => moveMonth(-12)}
            >
              «
            </button>
            <button
              type="button"
              aria-label="前月へ"
              disabled={
                month.year === todayParts.year &&
                month.month <= todayParts.month
              }
              onClick={() => moveMonth(-1)}
            >
              ‹
            </button>
            <h3 aria-live="polite">
              {month.year}年 {month.month}月
            </h3>
            <button
              type="button"
              aria-label="翌月へ"
              onClick={() => moveMonth(1)}
            >
              ›
            </button>
            <button
              type="button"
              aria-label="翌年へ"
              onClick={() => moveMonth(12)}
            >
              »
            </button>
          </div>
          <p className="field-help calendar-help">
            矢印キーで日付移動、PageUp / Downで月移動
          </p>
          <table aria-label={`${month.year}年${month.month}月`}>
            <thead>
              <tr>
                {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
                  <th scope="col" key={day}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: cells.length / 7 }, (_, row) => (
                <tr key={row}>
                  {cells.slice(row * 7, row * 7 + 7).map((date, index) => (
                    <td key={date ?? `empty-${index}`}>
                      {date && (
                        <button
                          type="button"
                          data-date={date}
                          aria-label={date.replace(
                            /^(\d+)-(\d+)-(\d+)$/,
                            "$1年$2月$3日",
                          )}
                          aria-current={date === today ? "date" : undefined}
                          aria-pressed={date === value}
                          tabIndex={date === focusDate ? 0 : -1}
                          disabled={!isSelectableDate(date, today)}
                          onFocus={() => setFocusDate(date)}
                          onKeyDown={(event) => navigate(event, date)}
                          onClick={() => choose(date)}
                        >
                          {parseCalendarDate(date)!.day}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="calendar-actions">
            <button type="button" onClick={() => choose(today)}>
              今日を選択
            </button>
            <button type="button" onClick={close}>
              閉じる
            </button>
          </div>
        </div>
      )}
      {value && (
        <button
          type="button"
          className="clear-date"
          onClick={() => onChange("")}
        >
          日付をクリア
        </button>
      )}
    </div>
  );
}
