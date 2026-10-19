import { useState, type FormEvent } from "react";
import { eventTypes, genres, type SearchFilters } from "../types/event";
import { emptyFilters, searchWindow } from "../lib/search";
export function SearchForm({
  onSearch,
}: {
  onSearch: (filters: SearchFilters) => void;
}) {
  const [draft, setDraft] = useState<SearchFilters>({ ...emptyFilters });
  const [error, setError] = useState("");
  const update = (key: keyof SearchFilters, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      searchWindow(draft);
      setError("");
      onSearch({ ...draft });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "入力を確認してください。",
      );
    }
  }
  return (
    <aside className="search-panel">
      <div className="section-kicker">FIND YOUR NEXT SESSION</div>
      <h2>練習を探す</h2>
      <form onSubmit={submit}>
        <label htmlFor="date">
          日付 <span>日本時間 / JST</span>
        </label>
        <input
          id="date"
          type="date"
          value={draft.date}
          onInput={(e) => update("date", e.currentTarget.value)}
          aria-describedby="time-help"
        />
        <div className="time-fields">
          <div>
            <label htmlFor="start">開始時間</label>
            <input
              id="start"
              type="time"
              value={draft.startTime}
              onInput={(e) => update("startTime", e.currentTarget.value)}
            />
          </div>
          <span>—</span>
          <div>
            <label htmlFor="end">終了時間</label>
            <input
              id="end"
              type="time"
              value={draft.endTime}
              onInput={(e) => update("endTime", e.currentTarget.value)}
            />
          </div>
        </div>
        <p className="field-help" id="time-help">
          時間は日付と一緒に指定。終了が開始より早い場合は翌日まで検索します。時刻未指定はその日全体が対象です。
        </p>
        <label htmlFor="genre">ジャンル</label>
        <select
          id="genre"
          value={draft.genre}
          onChange={(e) => update("genre", e.target.value)}
        >
          <option value="">すべてのジャンル</option>
          {genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <label htmlFor="type">イベント種別</label>
        <select
          id="type"
          value={draft.type}
          onChange={(e) => update("type", e.target.value)}
        >
          <option value="">すべてのイベント</option>
          {eventTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary search-button" type="submit">
          この条件で探す <span aria-hidden="true">↗</span>
        </button>
        <button
          type="button"
          className="reset"
          onClick={() => {
            setDraft({ ...emptyFilters });
            setError("");
            onSearch({ ...emptyFilters });
          }}
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
