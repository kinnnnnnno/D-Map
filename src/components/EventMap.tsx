import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { DanceEvent } from "../types/event";
import { formatPeriod } from "../lib/format";
import {
  getMarkerStyle,
  groupEventLocations,
  markerStyles,
} from "../lib/markers";

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
    // サイドパネルの開閉・画面回転など、モード以外の寸法変化にも対応します。
    const observer = new ResizeObserver(() =>
      instance.invalidateSize({ pan: true, animate: false }),
    );
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
    currentMarkers.clear();
    locations.forEach((location) => {
      const first = location.events[0];
      const style = getMarkerStyle(first.genre);
      // データをHTMLとして挿入せず、textContentで安全に概要を構成します。
      const popup = document.createElement("div");
      popup.className = "location-popup";
      const heading = document.createElement("strong");
      heading.textContent =
        location.events.length > 1
          ? "同じ場所のイベント（" + location.events.length + "件）"
          : first.venueName;
      popup.append(heading);
      location.events.forEach((event) => {
        const item = document.createElement("section");
        item.className = "location-event";
        item.dataset.eventId = event.id;
        const title = document.createElement("h3");
        title.textContent = event.title;
        const genre = document.createElement("p");
        const genreStyle = getMarkerStyle(event.genre);
        const genreSymbol = document.createElement("span");
        genreSymbol.className = "legend-symbol";
        genreSymbol.style.background = genreStyle.color;
        genreSymbol.textContent = genreStyle.symbol;
        genre.append(
          genreSymbol,
          document.createTextNode(" " + event.genre + " / " + event.type),
        );
        const time = document.createElement("p");
        time.textContent = formatPeriod(event.startAt, event.endAt);
        const select = document.createElement("button");
        select.type = "button";
        select.textContent = "このイベントを選択";
        select.className = "popup-select";
        select.dataset.selectId = event.id;
        select.onclick = () => onSelect(event.id);
        const detail = document.createElement("button");
        detail.type = "button";
        detail.textContent = "詳細を見る";
        detail.className = "popup-button";
        detail.onclick = () => onDetail(event.id);
        item.append(title, genre, time, select, detail);
        popup.append(item);
      });
      const face = document.createElement("span");
      face.className = "pin-face";
      face.dataset.baseGenre = first.genre;
      face.style.setProperty("--marker-color", style.color);
      const symbol = document.createElement("b");
      symbol.textContent = style.symbol;
      face.append(symbol);
      if (location.events.length > 1) {
        face.classList.add("pin-shared");
        const badge = document.createElement("i");
        badge.textContent = "＋";
        badge.className = "pin-shared-badge";
        face.append(badge);
      }
      const label =
        location.events.length > 1
          ? "同じ場所のイベント：" +
            location.events.map((event) => event.title).join("、")
          : style.label + "：" + first.title;
      const marker = L.marker([location.latitude, location.longitude], {
        title: label,
        alt: label,
        icon: L.divIcon({
          className: "event-pin",
          html: face,
          iconSize: [44, 48],
          iconAnchor: [22, 44],
          popupAnchor: [0, -38],
        }),
      })
        .bindPopup(popup, {
          maxWidth: 320,
          minWidth: 220,
          autoPanPadding: [20, 90],
        })
        .on("click", () => onSelect(first.id))
        .addTo(layer);
      const element = marker.getElement();
      element?.setAttribute("aria-label", label);
      element?.setAttribute("data-location", location.key);
      element?.setAttribute("data-genre", style.key);
      location.events.forEach((event) => currentMarkers.set(event.id, marker));
    });
    if (locations.length)
      instance.fitBounds(
        L.latLngBounds(
          locations.map(
            (location) =>
              [location.latitude, location.longitude] as [number, number],
          ),
        ),
        { padding: [50, 80], maxZoom: 13, animate: false },
      );
    return () => {
      layer.remove();
      currentMarkers.clear();
    };
  }, [locations, onSelect, onDetail]);
  useEffect(() => {
    const uniqueMarkers = new Set(markers.current.values());
    const selectedEvent = locations
      .flatMap((location) => location.events)
      .find((event) => event.id === selectedId);
    uniqueMarkers.forEach((marker) => {
      const active =
        selectedId !== null && markers.current.get(selectedId) === marker;
      marker.getElement()?.classList.toggle("is-selected", active);
      marker.getElement()?.setAttribute("aria-pressed", String(active));
      const face = marker.getElement()?.querySelector<HTMLElement>(".pin-face");
      if (face) {
        const style = getMarkerStyle(
          active && selectedEvent
            ? selectedEvent.genre
            : (face.dataset.baseGenre ?? ""),
        );
        face.style.setProperty("--marker-color", style.color);
        const symbol = face.querySelector("b");
        if (symbol) symbol.textContent = style.symbol;
        marker.getElement()?.setAttribute("data-genre", style.key);
      }
      const content = marker.getPopup()?.getContent();
      if (content instanceof HTMLElement) {
        content
          .querySelectorAll<HTMLButtonElement>("[data-select-id]")
          .forEach((button) =>
            button.setAttribute(
              "aria-pressed",
              String(button.dataset.selectId === selectedId),
            ),
          );
        content
          .querySelectorAll<HTMLElement>("[data-event-id]")
          .forEach((item) =>
            item.classList.toggle(
              "is-selected",
              item.dataset.eventId === selectedId,
            ),
          );
      }
    });
    if (selectedId) {
      const marker = markers.current.get(selectedId);
      if (marker) {
        marker.openPopup();
        map.current?.panTo(marker.getLatLng(), { animate: false });
      }
    }
  }, [selectedId, locations]);
  return (
    <section className="map-section" aria-label="イベントの地図">
      <div className="map" ref={container} />
      <div className="map-label">
        <span className="live-dot" /> TOKYO <span>東京都内</span>
      </div>
      {!expanded && (
        <button
          type="button"
          className="mode-button map-expand-button"
          onClick={onExpand}
        >
          地図を拡大 <span aria-hidden="true">↗</span>
        </button>
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
        <p>＋ は同じ場所に複数のイベント</p>
      </div>
      {tileError && (
        <p className="map-warning" role="status">
          地図の一部を取得できません。イベントの概要や一覧は引き続き利用できます。
        </p>
      )}
      <p className="map-result-count" role="status">
        {events.length}件を表示
      </p>
    </section>
  );
}
