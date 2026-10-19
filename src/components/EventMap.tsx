import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { DanceEvent } from "../types/event";
import { formatPeriod } from "../lib/format";
import {
  getMarkerStyle,
  groupEventLocations,
  markerStyles,
} from "../lib/markers";
import { clusterLocations, type MapGroup } from "../lib/clusters";

interface EventMapProps {
  events: DanceEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDetail: (id: string) => void;
  expanded: boolean;
  onExpand: () => void;
}
export function EventMap({
  events,
  selectedId,
  onSelect,
  onDetail,
  expanded,
  onExpand,
}: EventMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const selected = useRef<string | null>(null);
  const refreshSelection = useRef<(open?: boolean) => void>(() => {});
  const [tileError, setTileError] = useState(false);
  const locations = useMemo(() => groupEventLocations(events), [events]);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      scrollWheelZoom: false,
    }).setView([35.681, 139.72], 12);
    map.current = instance;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
      .on("tileerror", () => setTileError(true))
      .addTo(instance);
    const observer = new ResizeObserver(() => {
      instance
        .getContainer()
        .style.setProperty(
          "--popup-max-height",
          `${Math.max(60, instance.getContainer().clientHeight - 110)}px`,
        );
      instance.invalidateSize({ pan: true, animate: false });
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      map.current?.invalidateSize({ pan: true, animate: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [expanded]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const layer = L.layerGroup().addTo(instance);
    const currentMarkers = markers.current;
    // 同じ構成のグループはズーム後も再利用し、必要なマーカーだけを差し替えます。
    const registry = new Map<string, { marker: L.Marker; group: MapGroup }>();
    const eventById = new Map(
      locations
        .flatMap((location) => location.events)
        .map((event) => [event.id, event]),
    );
    function updateSelection(open = false) {
      const id = selected.current;
      const activeMarker = id ? currentMarkers.get(id) : undefined;
      const selectedEvent = id ? eventById.get(id) : undefined;
      registry.forEach(({ marker, group }) => {
        const element = marker.getElement(),
          active = marker === activeMarker;
        element?.classList.toggle("is-selected", active);
        element?.setAttribute("aria-pressed", String(active));
        const face = element?.querySelector<HTMLElement>(".pin-face");
        if (face) {
          const style = getMarkerStyle(
            active && selectedEvent
              ? selectedEvent.genre
              : group.locations[0].events[0].genre,
          );
          face.style.setProperty("--marker-color", style.color);
          const symbol = face.querySelector("b");
          if (symbol) symbol.textContent = style.symbol;
          element?.setAttribute("data-genre", style.key);
        }
        const content = marker
          .getPopup()
          ?.getElement()
          ?.querySelector(".location-popup");
        if (content instanceof HTMLElement) {
          content
            .querySelectorAll<HTMLButtonElement>("[data-select-id]")
            .forEach((button) =>
              button.setAttribute(
                "aria-pressed",
                String(button.dataset.selectId === id),
              ),
            );
          content
            .querySelectorAll<HTMLElement>("[data-event-id]")
            .forEach((item) =>
              item.classList.toggle("is-selected", item.dataset.eventId === id),
            );
        }
      });
      if (open && activeMarker && !activeMarker.isPopupOpen()) {
        // LeafletのautoPanに任せ、概要を収めた後に中心へ戻して隠してしまわないようにします。
        activeMarker.openPopup();
      }
    }
    function buildPopup(group: MapGroup): HTMLElement {
      // 概要のDOMは開く時だけ作ります。イベント文言はHTMLとして扱いません。
      const popup = document.createElement("div");
      popup.className = "location-popup";
      const groupEvents = group.locations.flatMap(
        (location) => location.events,
      );
      const heading = document.createElement("strong");
      heading.textContent =
        group.locations.length > 1
          ? "近接するイベント（" + group.eventCount + "件）"
          : groupEvents.length > 1
            ? "同じ場所のイベント（" + group.eventCount + "件）"
            : groupEvents[0].venueName;
      popup.append(heading);
      if (group.locations.length > 1) {
        const zoom = document.createElement("button");
        zoom.type = "button";
        zoom.className = "popup-select";
        zoom.textContent = "この範囲を拡大";
        zoom.disabled = instance!.getZoom() >= instance!.getMaxZoom();
        zoom.onclick = () =>
          instance!.fitBounds(
            L.latLngBounds(
              group.locations.map(
                (location) =>
                  [location.latitude, location.longitude] as [number, number],
              ),
            ),
            {
              maxZoom: Math.min(
                instance!.getMaxZoom(),
                instance!.getZoom() + 2,
              ),
              padding: [60, 60],
              animate: false,
            },
          );
        popup.append(zoom);
      }
      groupEvents.forEach((event) => {
        const item = document.createElement("section");
        item.className = "location-event";
        item.dataset.eventId = event.id;
        const title = document.createElement("h3");
        title.textContent = event.title;
        const genre = document.createElement("p"),
          style = getMarkerStyle(event.genre),
          symbol = document.createElement("span");
        symbol.className = "legend-symbol";
        symbol.style.background = style.color;
        symbol.textContent = style.symbol;
        genre.append(
          symbol,
          document.createTextNode(" " + event.genre + " / " + event.type),
        );
        const time = document.createElement("p");
        time.textContent = formatPeriod(event.startAt, event.endAt);
        const choose = document.createElement("button");
        choose.type = "button";
        choose.className = "popup-select";
        choose.textContent = "このイベントを選択";
        choose.dataset.selectId = event.id;
        choose.onclick = () => onSelect(event.id);
        const detail = document.createElement("button");
        detail.type = "button";
        detail.className = "popup-button";
        detail.textContent = "詳細を見る";
        detail.onclick = () => onDetail(event.id);
        item.append(title, genre, time, choose, detail);
        popup.append(item);
      });
      return popup;
    }
    function createMarker(group: MapGroup): L.Marker {
      const clustered = group.locations.length > 1;
      const first = group.locations[0].events[0],
        style = getMarkerStyle(first.genre);
      const face = document.createElement("span");
      face.className = clustered ? "cluster-face" : "pin-face";
      if (clustered) {
        const count = document.createElement("b");
        count.textContent = String(group.eventCount);
        const unit = document.createElement("small");
        unit.textContent = "イベント";
        face.append(count, unit);
      } else {
        face.style.setProperty("--marker-color", style.color);
        const symbol = document.createElement("b");
        symbol.textContent = style.symbol;
        face.append(symbol);
        if (group.eventCount > 1) {
          face.classList.add("pin-shared");
          const badge = document.createElement("i");
          badge.className = "pin-shared-badge";
          badge.textContent = "＋";
          face.append(badge);
        }
      }
      const label = clustered
        ? "近接イベント" + group.eventCount + "件（数字はイベント件数）"
        : group.eventCount > 1
          ? "同じ場所のイベント：" +
            group.locations[0].events.map((event) => event.title).join("、")
          : style.label + "：" + first.title;
      const marker = L.marker([group.latitude, group.longitude], {
        title: label,
        alt: label,
        icon: L.divIcon({
          className: clustered ? "event-pin cluster-pin" : "event-pin",
          html: face,
          iconSize: clustered ? [54, 54] : [44, 48],
          iconAnchor: clustered ? [27, 27] : [22, 44],
          popupAnchor: clustered ? [0, -25] : [0, -38],
        }),
      })
        .bindPopup(() => buildPopup(group), {
          maxWidth: 320,
          minWidth: 220,
          autoPanPadding: [20, 30],
        })
        .on("click", () => {
          if (!clustered) onSelect(first.id);
        })
        .on("popupopen", () => updateSelection(false))
        .addTo(layer);
      const element = marker.getElement();
      element?.setAttribute("aria-label", label);
      element?.setAttribute("data-location", group.key);
      element?.setAttribute("data-event-count", String(group.eventCount));
      if (!clustered) element?.setAttribute("data-genre", style.key);
      return marker;
    }
    function renderGroups() {
      container.current?.setAttribute("data-zoom", String(instance!.getZoom()));
      const groups = clusterLocations(locations, (location) =>
        instance!.project([location.latitude, location.longitude]),
      );
      const nextKeys = new Set(groups.map((group) => group.key));
      registry.forEach((entry, key) => {
        if (!nextKeys.has(key)) {
          layer.removeLayer(entry.marker);
          registry.delete(key);
        }
      });
      currentMarkers.clear();
      groups.forEach((group) => {
        let entry = registry.get(group.key);
        if (!entry) {
          entry = { marker: createMarker(group), group };
          registry.set(group.key, entry);
        }
        group.locations.forEach((location) =>
          location.events.forEach((event) =>
            currentMarkers.set(event.id, entry!.marker),
          ),
        );
      });
      updateSelection();
    }
    // 検索変更時だけ全件を収めます。ズーム・パン・拡大切替では検索Effectを再実行しません。
    if (locations.length)
      instance.fitBounds(
        L.latLngBounds(
          locations.map(
            (location) =>
              [location.latitude, location.longitude] as [number, number],
          ),
        ),
        { padding: [50, 50], maxZoom: 13, animate: false },
      );
    instance.on("zoomend", renderGroups);
    renderGroups();
    refreshSelection.current = updateSelection;
    updateSelection(true);
    return () => {
      instance.off("zoomend", renderGroups);
      layer.remove();
      currentMarkers.clear();
      refreshSelection.current = () => {};
    };
  }, [locations, onSelect, onDetail]);
  useEffect(() => {
    selected.current = selectedId;
    refreshSelection.current(true);
  }, [selectedId]);
  return (
    <section className="map-section" aria-label="イベントの地図">
      <div className="map-header">
        <div className="map-label">
          <span className="live-dot" /> TOKYO <span>東京都内</span>
        </div>
        <p className="map-result-count" role="status">
          {events.length}件を表示
        </p>
        {!expanded && (
          <button
            type="button"
            className="mode-button map-expand-button"
            onClick={onExpand}
          >
            地図を拡大 <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
      <div className="map-canvas">
        <div className="map" ref={container} />
      </div>
      {tileError && (
        <p className="map-warning" role="status">
          地図の一部を取得できません。イベントの概要や一覧は引き続き利用できます。
        </p>
      )}
      <div className="map-legend" aria-label="ジャンル別マーカーの凡例">
        <span className="legend-title">ジャンル</span>
        <ul>
          {markerStyles.map((style) => (
            <li key={style.key} data-genre={style.key}>
              <span
                className="legend-symbol"
                style={{ background: style.color }}
              >
                {style.symbol}
              </span>
              {style.label}
            </li>
          ))}
        </ul>
        <p>
          ＋
          は同じ場所の複数イベント。丸い数字は近接イベントの件数です。クリック・タップで全件を確認できます。
        </p>
      </div>
    </section>
  );
}
