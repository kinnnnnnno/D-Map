import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { fetchEvents } from "./services/eventService";
import { emptyFilters, filterEvents, validateSearchInput } from "./lib/search";
import { useTodayJst } from "./hooks/useTodayJst";
import type { DanceEvent, EventSelection, SearchFilters } from "./types/event";
import type { Prefecture } from "./data/prefectures";
import { SearchForm } from "./components/SearchForm";
import { EventMap } from "./components/EventMap";
import { EventList } from "./components/EventList";
import { EventDetail } from "./components/EventDetail";
import { AccountPanel } from "./components/AccountPanel";
import { api, type UserProfile, type SessionInfo } from "./services/api";
import { PAGE_SIZE, paginate } from "./lib/pagination";
import { formatPeriod } from "./lib/format";
import { lockBodyOverflow } from "./lib/scrollLock";
export default function App() {
  const [availableEvents, setAvailableEvents] = useState<DanceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const eventRequest = useRef<AbortController|null>(null);
  useEffect(() => {
    const controller = new AbortController();
    eventRequest.current = controller;
    setLoading(true);
    setLoadError("");
    fetchEvents(controller.signal).then(data => { if (!controller.signal.aborted) {setAvailableEvents(data); setHasLoaded(true);} }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "取得に失敗しました。");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const demoEvents = availableEvents.filter(event => event.isDemo !== false);
  const demoPeriod = demoEvents.length ? formatPeriod(
    new Date(Math.min(...demoEvents.map(event => Date.parse(event.startAt)))).toISOString(),
    new Date(Math.max(...demoEvents.map(event => Date.parse(event.endAt)))).toISOString(),
  ) : "未取得";
  const [filters, setFilters] = useState<SearchFilters>({ ...emptyFilters, prefectures: ["東京都"] });
  const [user, setUser] = useState<UserProfile|null>(null);
  useEffect(() => { let active=true; api<SessionInfo>("/auth/session").then(data => {if(active) setUser(data.user);}).catch(()=>{});return()=>{active=false;}; }, []);
  const [selection, setSelection] = useState<EventSelection | null>(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const today = useTodayJst();
  const { events, error } = useMemo(() => {
    try {
      validateSearchInput(filters, today);
      return { events: filterEvents(availableEvents, filters, true), error: "" };
    } catch (error) {
      return {
        events: [],
        error:
          error instanceof Error ? error.message : "条件を確認してください。",
      };
    }
  }, [filters, today, availableEvents]);
  const visibleSelectedId = events.some((event) => event.id === selectedId)
    ? selectedId
    : null;
  const selectOnMap = useCallback((id: string) => {
    setSelectedId(id);
    setSelection(current => ({ id, source: "map", sequence: (current?.sequence ?? 0) + 1 }));
    const index = events.findIndex(event => event.id === id);
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE) + 1);
  }, [events]);
  const detailOnMap = useCallback((id: string) => {
    selectOnMap(id);
    setDetailId(id);
  }, [selectOnMap]);
  const selectOnList = useCallback((id: string) => {
    setSelectedId(id);
    setSelection(current => ({ id, source: "list", sequence: (current?.sequence ?? 0) + 1 }));
    setDetailId(id);
  }, []);
  const search = useCallback((next: SearchFilters) => {
    setFilters(next);
    setPage(1);
    try {
      validateSearchInput(next, today);
      const ids = new Set(
        filterEvents(availableEvents, next, true).map((event) => event.id),
      );
      setSelectedId((current) =>
        current && ids.has(current) ? current : null,
      );
      setDetailId((current) => (current && ids.has(current) ? current : null));
    } catch {
      setSelectedId(null);
      setDetailId(null);
    }
  }, [today, availableEvents]);
  const changePrefectures = useCallback((prefectures: Prefecture[]) => search({ ...filters, prefectures }), [filters, search]);
  const expandMap = useCallback(() => { setSearchOpen(false); setExpanded(true); }, []);
  useEffect(() => {
    if (!expanded) return;
    const releaseOverflow = lockBodyOverflow();
    const currentWorkspace = workspace.current;
    currentWorkspace?.focus({ preventScroll: true });
    return () => {
      releaseOverflow();
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
        <AccountPanel user={user} onUser={next => {
          if (next?.id !== user?.id) {
            eventRequest.current?.abort();
            setAvailableEvents(current => current.filter(event => event.visibility === "public"));
            setDetailId(null);setSelectedId(null);
          }
          setUser(next);
        }} onChanged={() => {setDetailId(null);setReload(value => value + 1);}} />
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
            デモイベントは架空の情報です。ユーザーが作成した予定とは区別して表示します。
            <span> デモ開催期間：{demoPeriod}（日本時間）。</span>
          </p>
        </div>
        {loading && <p role="status">イベントを読み込み中です。</p>}
        {loadError && <div role="alert">{loadError}<button onClick={() => setReload(value => value + 1)}>再試行</button></div>}
        {hasLoaded && <div
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
              selection={selection}
              onSelect={selectOnMap}
              onDetail={detailOnMap}
              expanded={expanded}
              prefectures={filters.prefectures}
              onPrefecturesChange={changePrefectures}
              onExpand={expandMap}
            />
            <EventList
              events={events}
              selectedId={visibleSelectedId}
              onSelect={selectOnList}
              page={paginate(events, page).page}
              onPageChange={setPage}
            />
          </div>
        </div>}
      </main>
      <footer inert={expanded}>
        <a className="footer-brand" href="/">
          D-Map.
        </a>
        <span>練習から、つながろう。</span>
        <small>PHASE 01 · PORTFOLIO DEMO</small>
      </footer>
      <EventDetail
        user={user}
        event={events.find((event) => event.id === detailId) ?? null}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}
