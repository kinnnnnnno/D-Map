import { useCallback, useMemo, useState } from "react";
import { getPublicEvents } from "./services/eventService";
import { emptyFilters, filterEvents } from "./lib/search";
import type { SearchFilters } from "./types/event";
import { SearchForm } from "./components/SearchForm";
import { EventMap } from "./components/EventMap";
import { EventList } from "./components/EventList";
import { EventDetail } from "./components/EventDetail";
const publicEvents = getPublicEvents();
export default function App() {
  const [filters, setFilters] = useState<SearchFilters>({ ...emptyFilters });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const events = useMemo(() => filterEvents(publicEvents, filters), [filters]);
  const select = useCallback((id: string) => {
    setSelectedId(id);
    setDetailId(id);
  }, []);
  const search = (next: SearchFilters) => {
    setFilters(next);
    setSelectedId(null);
    setDetailId(null);
  };
  return (
    <>
      <a className="skip-link" href="#main">
        メインコンテンツへ
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="D-Map ホーム">
          <span className="brand-icon" aria-hidden="true">
            d<span>↗</span>
          </span>
          D-Map<span className="brand-period">.</span>
        </a>
        <span className="header-tagline">
          練習をもっとオープンに、つながりをもっと自由に。
        </span>
        <span className="demo-badge">デモデータ</span>
      </header>
      <main id="main">
        <section className="hero">
          <div>
            <p className="eyebrow">
              <span /> FIND YOUR FLOOR.
            </p>
            <h1>
              踊る場所を、
              <br className="mobile-break" />
              見つけよう<span>。</span>
            </h1>
            <p className="hero-copy">
              いつもの街に、新しいグルーヴ。
              <br />
              地図から探す、ダンスの練習会とセッション。
            </p>
          </div>
          <div className="hero-side">
            <span className="hero-orbit" aria-hidden="true">
              ↗
            </span>
            <p>
              NEW MOVES.
              <br />
              NEW CONNECTIONS.
            </p>
          </div>
        </section>
        <div className="demo-notice">
          <span className="notice-label">DEMO</span>
          <p>
            掲載情報はすべて架空のデモデータです。
            <span> 2026年10月24日・25日・31日のイベントをお試しください。</span>
          </p>
        </div>
        <div className="workspace">
          <SearchForm onSearch={search} />
          <div className="discovery">
            <EventMap
              events={events}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDetail={select}
            />
            <EventList
              events={events}
              selectedId={selectedId}
              onSelect={select}
            />
          </div>
        </div>
      </main>
      <footer>
        <a className="footer-brand" href="/">
          D-Map.
        </a>
        <span>練習から、つながろう。</span>
        <small>PHASE 01 · PORTFOLIO DEMO</small>
      </footer>
      <EventDetail
        event={events.find((event) => event.id === detailId) ?? null}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}
