import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Location } from "../lib/location";

/** 保存済み座標をそのまま表示する。住所からの再検索・座標の推測はしない。 */
export function VenueMap({ latitude, longitude }: Location) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const map = L.map(host.current!, { scrollWheelZoom: false, dragging: false, touchZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, zoomControl: false }).setView([latitude, longitude], 17);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    L.marker([latitude, longitude], { keyboard: false, icon: L.divIcon({ className: "venue-pin", html: '<span aria-hidden="true">📍</span>', iconSize: [44, 44], iconAnchor: [22, 40] }) }).addTo(map);
    const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(host.current!);
    return () => { observer.disconnect(); map.remove(); };
  }, [latitude, longitude]);
  return <section aria-label="保存された開催場所"><div ref={host} className="venue-map" aria-label="保存された開催場所の地図" data-latitude={latitude} data-longitude={longitude}/>
    <p className="field-help">登録者が指定した位置：緯度 {latitude.toFixed(6)} / 経度 {longitude.toFixed(6)}。住所との一致を自動保証する表示ではありません。</p></section>;
}
