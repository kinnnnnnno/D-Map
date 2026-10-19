import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { getPublicEvents } from "./services/eventService";
import { emptyFilters, filterEvents, validateSearchInput } from "./lib/search";
import { useTodayJst } from "./hooks/useTodayJst";
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
  const [expanded, setExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const today = useTodayJst();
  const { events, error } = useMemo(() => {
    try {
      validateSearchInput(filters, today);
      return { events: filterEvents(publicEvents, filters), error: "" };
    } catch (error) {
      return {
        events: [],
        error:
          error instanceof Error ? error.message : "条件を確認してください。",
      };
    }
  }, [filters, today]);
  const visibleSelectedId = events.some((event) => event.id === selectedId)
    ? selectedId
    : null;
  const select = useCallback((id: string) => {
    setSelectedId(id);
    setDetailId(id);
  }, []);
  const search = (next: SearchFilters) => {
    setFilters(next);
    try {
      validateSearchInput(next, today);
      const ids = new Set(
        filterEvents(publicEvents, next).map((event) => event.id),
      );
      setSelectedId((current) =>
        current && ids.has(current) ? current : null,
      );
      setDetailId((current) => (current && ids.has(current) ? current : null));
    } catch {
      setSelectedId(null);
      setDetailId(null);
    }
  };
  useEffect(() => {
    if (!expanded) return;
    const overflow = document.body.style.overflow;
    const currentWorkspace = workspace.current;
    document.body.style.overflow = "hidden";
    currentWorkspace?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      // 通常表示で再生成された起点ボタンへ戻します。古いDOM参照は使いません。
      currentWorkspace
        ?.querySelector<HTMLButtonElement>(".map-expand-button")
        ?.focus({ preventScroll: true });
    };
  }, [expanded]);
  function handleWorkspaceKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!expanded) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setExpanded(false);
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(
      workspace.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select, [tabindex="0"]',
      ) ?? [],
    ).filter((element) => element.getClientRects().length > 0);
    const first = controls[0],
      last = controls[controls.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === workspace.current)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  return (
    <>
      <a className="skip-link" href="#main" inert={expanded}>
        メインコンテンツへ
      </a>
      <header className="site-header" inert={expanded}>
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
        <section className="hero" inert={expanded}>
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
        <div className="demo-notice" inert={expanded}>
          <span className="notice-label">DEMO</span>
          <p>
            掲載情報はすべて架空のデモデータです。
            <span> 2026年10月24日・25日・31日のイベントをお試しください。</span>
          </p>
        </div>
        <div
          className={`workspace ${expanded ? "workspace-expanded" : ""} ${searchOpen ? "search-open" : ""}`}
          ref={workspace}
          role={expanded ? "dialog" : undefined}
          aria-modal={expanded || undefined}
          aria-label={expanded ? "地図拡大モード" : undefined}
          tabIndex={-1}
          onKeyDown={handleWorkspaceKey}
        >
          {expanded && (
            <div className="expanded-toolbar">
              <strong>
                D-Map<span> / MAP VIEW</span>
              </strong>
              <p role="status">
                {error
                  ? "条件を確認してください"
                  : `${events.length}件のイベント`}{" "}
                · デモデータ
              </p>
              <button
                type="button"
                className="mobile-search-toggle"
                aria-expanded={searchOpen}
                aria-controls="search-panel"
                onClick={() => setSearchOpen((current) => !current)}
              >
                {searchOpen ? "検索条件を閉じる" : "検索条件を開く"}
              </button>
              <button
                type="button"
                className="mode-button"
                onClick={() => setExpanded(false)}
              >
                通常表示に戻る <span aria-hidden="true">↙</span>
              </button>
            </div>
          )}
          <SearchForm
            filters={filters}
            today={today}
            error={error}
            onChange={search}
          />
          <div className="discovery">
            <EventMap
              events={events}
              selectedId={visibleSelectedId}
              onSelect={setSelectedId}
              onDetail={select}
              expanded={expanded}
              onExpand={() => {
                setSearchOpen(false);
                setExpanded(true);
              }}
            />
            <EventList
              events={events}
              selectedId={visibleSelectedId}
              onSelect={select}
            />
          </div>
        </div>
      </main>
      <footer inert={expanded}>
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
