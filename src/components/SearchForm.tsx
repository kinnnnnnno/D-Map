import { eventTypes, genres, type SearchFilters } from "../types/event";
import { emptyFilters } from "../lib/search";
import { ALL_GENRES } from "../types/event";
import { timeOptions } from "../lib/calendar";
import { DatePicker } from "./DatePicker";

export function SearchForm({
  filters,
  today,
  error,
  onChange,
}: {
  filters: SearchFilters;
  today: string;
  error: string;
  onChange: (filters: SearchFilters) => void;
}) {
  const update = (key: Exclude<keyof SearchFilters, "prefectures" | "genre">, value: string) =>
    onChange({ ...filters, [key]: value });
  return (
    <aside
      className="search-panel"
      aria-label="イベント検索条件"
      id="search-panel"
    >
      <div className="section-kicker">FIND YOUR NEXT SESSION</div>
      <h2>練習を探す</h2>
      <p className="auto-search-note">条件を変更すると自動で反映されます</p>
      <form onSubmit={(event) => event.preventDefault()}>
        <DatePicker
          value={filters.date}
          today={today}
          onChange={(date) => update("date", date)}
        />
        <div className="time-fields">
          {(["startTime", "endTime"] as const).map((key, index) => (
            <div key={key}>
              <label htmlFor={key}>
                {index === 0 ? "開始時間" : "終了時間"}
              </label>
              <select
                id={key}
                value={filters[key]}
                aria-describedby="time-help"
                onChange={(event) => update(key, event.target.value)}
              >
                <option value="">指定なし</option>
                {timeOptions.map((time) => (
                  <option key={time}>{time}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="field-help" id="time-help">
          時刻は15分単位・日付と一緒に指定。未指定は当日全体、開始のみは翌0時まで、終了のみは当日0時から。終了が開始より早ければ翌日まで、同時刻はエラーです。
        </p>
        <label htmlFor="genre">ジャンル</label>
        <select
          id="genre"
          value={filters.genre}
          onChange={(event) => onChange({ ...filters, genre: genres.find(genre => genre === event.target.value) ?? ALL_GENRES })}
        >
          <option value={ALL_GENRES}>すべてのジャンル</option>
          {genres.map((genre) => (
            <option key={genre} value={genre}>{genre}</option>
          ))}
        </select>
        <label htmlFor="type">イベント種別</label>
        <select
          id="type"
          value={filters.type}
          onChange={(event) => update("type", event.target.value)}
        >
          <option value="">すべてのイベント</option>
          {eventTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
        {error && (
          <p role="alert" className="error">
            {error} 条件を直すまで結果を表示しません。
          </p>
        )}
        <button
          type="button"
          className="reset"
          onClick={() => onChange({ ...emptyFilters, prefectures: filters.prefectures })}
        >
          条件をリセット
        </button>
      </form>
      <div className="search-note">
        <span aria-hidden="true">◷</span>
        <p>
          少しだけ、時間が合う。
          <br />
          そこから始まるつながりもある。
        </p>
      </div>
    </aside>
  );
}
