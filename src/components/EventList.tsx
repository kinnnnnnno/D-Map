import type { DanceEvent } from "../types/event";
import { formatFee, formatPeriod } from "../lib/format";
import { getMarkerStyle } from "../lib/markers";
import { useRef } from "react";
import { paginate } from "../lib/pagination";
export function EventList({
  events,
  selectedId,
  onSelect,
  page,
  onPageChange,
}: {
  events: DanceEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const pagination = paginate(events, page);
  const visibleEvents = pagination.items;
  function changePage(next: number) {
    onPageChange(next);
    heading.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }
  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results-header">
        <div>
          <div className="section-kicker">OPEN PRACTICES & SESSIONS</div>
          <h2 id="results-title" ref={heading} tabIndex={-1}>
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
            都道府県を「全国」にすると他の地域も探せます。
          </p>
        </div>
      ) : (
        <div className="event-grid">
          {visibleEvents.map((event) => (
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
                {event.visibility === "group" && <span className="event-type">グループ限定</span>}
                {event.status === "cancelled" && <span className="event-type">中止</span>}
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
      {events.length > 0 && <p className="page-range" aria-live="polite">
        全{events.length}件中{pagination.first}〜{pagination.last}件を表示
      </p>}
      {pagination.totalPages > 1 && <nav className="pagination" aria-label="イベント一覧のページ">
        <button type="button" disabled={pagination.page === 1} onClick={() => changePage(pagination.page - 1)}>前へ</button>
        <span aria-current="page">{pagination.page} / {pagination.totalPages}ページ</span>
        <button type="button" disabled={pagination.page === pagination.totalPages} onClick={() => changePage(pagination.page + 1)}>次へ</button>
      </nav>}
    </section>
  );
}
