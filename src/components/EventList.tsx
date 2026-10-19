import type { DanceEvent } from "../types/event";
import { formatFee, formatPeriod } from "../lib/format";
import { getMarkerStyle } from "../lib/markers";
export function EventList({
  events,
  selectedId,
  onSelect,
}: {
  events: DanceEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results-header">
        <div>
          <div className="section-kicker">OPEN PRACTICES & SESSIONS</div>
          <h2 id="results-title">
            見つかった練習{" "}
            <span aria-live="polite">
              {events.length}
              <small>件</small>
            </span>
          </h2>
        </div>
        <span className="sort-label">開催日時順</span>
      </div>
      {events.length === 0 ? (
        <div className="empty" role="status">
          <span aria-hidden="true">⌕</span>
          <h3>条件に合うイベントがありません</h3>
          <p>
            日付やジャンルを変更するか、条件をリセットしてください。
            <br />
            デモイベントは2026年10月24日・25日・31日に開催されます。
          </p>
        </div>
      ) : (
        <div className="event-grid">
          {events.map((event) => (
            <button
              key={event.id}
              className={`event-card ${selectedId === event.id ? "selected" : ""}`}
              onClick={() => onSelect(event.id)}
              aria-pressed={selectedId === event.id}
              data-event-id={event.id}
            >
              <div className="card-top">
                <span className="genre">{event.genre}</span>
                <span className="event-type">{event.type}</span>
                <span
                  className="card-marker-key"
                  style={{ background: getMarkerStyle(event.genre).color }}
                  aria-label={`地図の表記 ${getMarkerStyle(event.genre).label}`}
                >
                  {getMarkerStyle(event.genre).symbol}
                </span>
                {selectedId === event.id && (
                  <span className="selected-label">選択中</span>
                )}
              </div>
              <h3>{event.title}</h3>
              <p className="event-time">
                {formatPeriod(event.startAt, event.endAt)}
              </p>
              <p className="venue">⌖ {event.venueName}</p>
              <div className="card-bottom">
                <span>
                  {formatFee(event.feeYen)}
                  <small> / 人</small>
                </span>
                <span className="detail-link">詳細を見る ↗</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
