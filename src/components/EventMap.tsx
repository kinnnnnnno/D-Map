import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { DanceEvent } from "../types/event";
import { formatPeriod } from "../lib/format";
export function EventMap({
  events,
  selectedId,
  onSelect,
  onDetail,
}: {
  events: DanceEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDetail: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const [tileError, setTileError] = useState(false);
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
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const layer = L.layerGroup().addTo(instance);
    const currentMarkers = markers.current;
    currentMarkers.clear();
    events.forEach((event, index) => {
      // Use textContent: data is never interpreted as HTML, including in Leaflet popups.
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = event.title;
      const time = document.createElement("p");
      time.textContent = formatPeriod(event.startAt, event.endAt);
      const venue = document.createElement("p");
      venue.textContent = event.venueName;
      const button = document.createElement("button");
      button.textContent = "詳細を見る";
      button.className = "popup-button";
      button.onclick = () => onDetail(event.id);
      content.append(title, time, venue, button);
      const marker = L.marker([event.latitude, event.longitude], {
        title: event.title,
        alt: event.title,
        icon: L.divIcon({
          className: "event-pin",
          html: `<span><b>${index + 1}</b></span>`,
          iconSize: [34, 42],
          iconAnchor: [17, 42],
          popupAnchor: [0, -40],
        }),
      })
        .bindPopup(content)
        .on("click", () => onSelect(event.id))
        .addTo(layer);
      currentMarkers.set(event.id, marker);
    });
    if (events.length)
      instance.fitBounds(
        L.latLngBounds(
          events.map(
            (event) => [event.latitude, event.longitude] as [number, number],
          ),
        ),
        { padding: [45, 45], maxZoom: 13 },
      );
    return () => {
      layer.remove();
      currentMarkers.clear();
    };
  }, [events, onSelect, onDetail]);
  useEffect(() => {
    if (!selectedId) return;
    const marker = markers.current.get(selectedId);
    if (marker) {
      marker.openPopup();
      map.current?.panTo(marker.getLatLng());
    }
  }, [selectedId, events]);
  return (
    <section className="map-section" aria-label="イベントの地図">
      <div className="map" ref={container} />
      <div className="map-label">
        <span className="live-dot" /> TOKYO <span>東京都内</span>
      </div>
      {tileError && (
        <p className="map-warning" role="status">
          地図の一部を取得できません。一覧からもイベントを確認できます。
        </p>
      )}
      <div className="map-hint">ピンを選んで、練習の詳細を見る</div>
    </section>
  );
}
