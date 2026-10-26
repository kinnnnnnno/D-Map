import {
  Profiler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { EventMap } from "../../src/components/EventMap";
import { EventList } from "../../src/components/EventList";
import { EventDetail } from "../../src/components/EventDetail";
import { SearchForm } from "../../src/components/SearchForm";
import { emptyFilters, filterEvents } from "../../src/lib/search";
import { denseEvents } from "./denseEvents";
import { getPublicEvents } from "../../src/services/eventService";
import App from "../../src/App";
import "leaflet/dist/leaflet.css";
import "../../src/styles.css";
const source =
  new URLSearchParams(location.search).get("dataset") === "demo"
    ? getPublicEvents()
    : denseEvents;
function Harness() {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const events = useMemo(() => filterEvents(source, filters), [filters]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const metrics = useRef<HTMLOutputElement>(null);
  const commits = useRef(0);
  const report = useRef<HTMLPreElement>(null);
  const since = useRef(0);
  const lifecycle = useRef({ mapPanes: 0, markerNodes: 0 });
  useEffect(() => {
    const panes = new WeakSet<Element>(),
      pins = new WeakSet<Element>();
    const inspect = (node: Node) => {
      if (!(node instanceof Element)) return;
      for (const element of [
        node,
        ...node.querySelectorAll(".leaflet-map-pane,.event-pin"),
      ]) {
        if (element.matches(".leaflet-map-pane") && !panes.has(element)) {
          panes.add(element);
          lifecycle.current.mapPanes++;
        }
        if (element.matches(".event-pin") && !pins.has(element)) {
          pins.add(element);
          lifecycle.current.markerNodes++;
        }
      }
    };
    inspect(document.getElementById("root")!);
    const observer = new MutationObserver((records) =>
      records.forEach((record) => record.addedNodes.forEach(inspect)),
    );
    observer.observe(document.getElementById("root")!, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);
  function recordResources() {
    const tiles = (
      performance.getEntriesByType("resource") as PerformanceResourceTiming[]
    ).filter(
      (entry) =>
        entry.name.startsWith("https://tile.openstreetmap.org/") &&
        entry.startTime >= since.current,
    );
    const rows = tiles.map((entry) => ({
      url: entry.name,
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
      duration: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      deliveryType:
        (entry as PerformanceResourceTiming & { deliveryType?: string })
          .deliveryType ?? null,
      responseStatus: entry.responseStatus,
    }));
    const images = Array.from(
      document.querySelectorAll<HTMLImageElement>(".leaflet-tile"),
    );
    if (report.current)
      report.current.textContent = JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
          viewport: { width: innerWidth, height: innerHeight },
          zoom: document.querySelector(".map")?.getAttribute("data-zoom"),
          intervalStart: since.current,
          resourceCount: rows.length,
          responseSpanMs: rows.length
            ? Math.max(...rows.map((row) => row.responseEnd)) -
              Math.min(...rows.map((row) => row.startTime))
            : null,
          fromIntervalStartMs: rows.length
            ? Math.max(...rows.map((row) => row.responseEnd)) - since.current
            : null,
          loadedTiles: images.filter(
            (image) => image.complete && image.naturalWidth > 0,
          ).length,
          pendingTiles: images.filter((image) => !image.complete).length,
          failedTiles: images.filter(
            (image) => image.complete && image.naturalWidth === 0,
          ).length,
          reactCommits: commits.current,
          ...lifecycle.current,
          tiles: rows,
        },
        null,
        2,
      );
  }
  const select = useCallback((id: string) => {
    setSelectedId(id);
    setDetailId(id);
  }, []);
  return (
    <main>
      <h1>地図検証専用・架空データ</h1>
      <div>
        <button
          type="button"
          onClick={() => {
            since.current = performance.now();
          }}
        >
          次の計測区間を開始
        </button>
        <button type="button" onClick={recordResources}>
          通信・描画の記録を表示
        </button>
      </div>
      <pre
        id="resource-report"
        ref={report}
        style={{ maxHeight: 150, overflow: "auto", fontSize: 10 }}
      />
      <output
        ref={metrics}
        id="map-metrics"
        data-commits="0"
        aria-label="地図のReactコミット数"
      />
      <div className={expanded ? "workspace workspace-expanded" : "workspace"}>
        {expanded && (
          <div className="expanded-toolbar">
            <button onClick={() => setExpanded(false)}>通常表示に戻る</button>
          </div>
        )}
        <SearchForm
          today="2026-10-19"
          filters={filters}
          error=""
          onChange={next => { setFilters(next); setPage(1); }}
        />
        <div className="discovery">
          <Profiler
            id="event-map"
            onRender={() => {
              commits.current++;
              if (metrics.current)
                metrics.current.dataset.commits = String(commits.current);
            }}
          >
            <EventMap
              events={events}
              selectedId={
                events.some((event) => event.id === selectedId)
                  ? selectedId
                  : null
              }
              onSelect={setSelectedId}
              onDetail={select}
              expanded={expanded}
              onExpand={() => setExpanded(true)}
            />
          </Profiler>
          <EventList
            page={page}
            onPageChange={setPage}
            events={events}
            selectedId={selectedId}
            onSelect={select}
          />
        </div>
      </div>
      <EventDetail
        event={events.find((event) => event.id === detailId) ?? null}
        onClose={() => setDetailId(null)}
      />
    </main>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(new URLSearchParams(location.search).get("dataset") === "app" ? <App /> : <Harness />);
// 破棄時の副作用を検証する、開発用ハーネスだけの入口です。
window.addEventListener("test:unmount", () => root.unmount(), { once: true });
