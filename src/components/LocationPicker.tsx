import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { api } from "../services/api";
import { regionView } from "../data/prefectures";
import { accuracyLabel, accuracyNotice, canConfirmPlace, canSavePlace, locationWarnings, moveLocation, parseCandidates, requiresManualLocation, selectPlace, type Location, type PlaceCandidate, type SelectedPlace } from "../lib/location";

export function LocationPicker({ value, address, prefecture, onChange }: {
  value: SelectedPlace | null; address: string; prefecture: string; onChange: (value: SelectedPlace | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), marker = useRef<L.Marker | null>(null);
  const epoch = useRef(0);
  const manual = useRef<(point: Location) => void>(() => {});
  manual.current = point => { epoch.current++; onChange(selectPlace(point, address, "manual")); };
  const initial = useRef({ value, prefecture });
  // 入力変更後の古い検索応答を、現在の住所の候補として表示しない。
  const latest = useRef({ address, prefecture, value }); latest.current = { address, prefecture, value };
  const active = useRef(true);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [reverseBusy, setReverseBusy] = useState(false);
  const [results, setResults] = useState<{ address: string; candidates: PlaceCandidate[] } | null>(null);
  const candidates = results?.address === address ? results.candidates : [];
  useEffect(() => { epoch.current++; }, [address]);
  useEffect(() => {
    active.current = true;
    const view = regionView(initial.current.prefecture || "東京都"), position = initial.current.value;
    const instance = L.map(host.current!, { scrollWheelZoom: false }).setView(position ? [position.latitude, position.longitude] : view.center, position ? 17 : view.zoom);
    map.current = instance;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(instance);
    instance.on("click", (event: L.LeafletMouseEvent) => { const point = event.latlng.wrap(); manual.current({ latitude: point.lat, longitude: point.lng }); });
    const observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(host.current!);
    return () => { active.current = false; observer.disconnect(); instance.remove(); map.current = null; marker.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    if (!value) { marker.current?.remove(); marker.current = null; if (host.current) { delete host.current.dataset.markerLatitude; delete host.current.dataset.markerLongitude; } return; }
    const point: L.LatLngTuple = [value.latitude, value.longitude];
    if (!marker.current) {
      marker.current = L.marker(point, { draggable: true, icon: L.divIcon({ className: "location-pin", html: '<span aria-hidden="true">📍</span>', iconSize: [44, 44], iconAnchor: [22, 40] }), title: "選択した開催場所（ドラッグで変更・変更後は再確定）" }).addTo(map.current);
      marker.current.on("dragend", () => { const p = marker.current!.getLatLng().wrap(); manual.current({ latitude: p.lat, longitude: p.lng }); });
    } else marker.current.setLatLng(point);
    // Reactの値とは別に、Leaflet自身が保持する座標を回帰テストで照合する。
    const rendered = marker.current.getLatLng();
    if (host.current) { host.current.dataset.markerLatitude = String(rendered.lat); host.current.dataset.markerLongitude = String(rendered.lng); }
    // 検索候補は必ず中央・詳細倍率で表示。確認操作だけでは移動しない。
    const center = map.current.getCenter();
    const differs = Math.abs(center.lat - value.latitude) > .000001 || Math.abs(center.lng - value.longitude) > .000001;
    if (value.source === "search" && !value.confirmed && (differs || map.current.getZoom() !== 17)) {
      map.current.setView(point, 17, { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
    } else if (!map.current.getBounds().pad(-.15).contains(point)) map.current.panTo(point, { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  }, [value]);
  async function search() {
    if (busy || address.trim().length < 2) return;
    const submitted = { address };
    const token = ++epoch.current;
    setBusy(true); setResults(null); setMessage(""); onChange(null);
    try {
      const found = parseCandidates(await api<unknown>("/geocode", "POST", { query: address.trim() }));
      if (active.current && epoch.current === token && latest.current.address === submitted.address) {
        setResults({ ...submitted, candidates: found });
        if (found.length === 1) onChange(selectPlace(found[0], address, "search", found[0]));
        setMessage(found.length === 1 ? "候補を地図に表示しました。住所と位置を確認して確定してください。" : found.length ? "所在地住所を確認して候補を選び、地図で照合してください。" : "候補がありません。住所を詳しくするか、地図から指定してください。");
      }
    } catch (error) { if (active.current && epoch.current === token && latest.current.address === submitted.address) setMessage(error instanceof Error ? error.message : "検索できません。地図から指定してください。"); }
    finally { if (active.current) setBusy(false); }
  }
  async function reverse() {
    if (!value || value.source !== "manual" || reverseBusy) return;
    const selected = value, token = ++epoch.current;
    setReverseBusy(true); setMessage("");
    try {
      const data = await api<unknown>("/reverse-geocode", "POST", { latitude: selected.latitude, longitude: selected.longitude });
      const result = data === null ? null : parseCandidates([data])[0];
      if (active.current && epoch.current === token && latest.current.value === selected && latest.current.address === selected.inputAddress) {
        if (result) onChange({ ...selected, estimatedAddress: result.label, estimatedPrefecture: result.prefecture });
        setMessage(result ? "推定住所を取得しました。ピンと住所の一致は保証されません。" : "住所を取得できませんでした。地図の位置を確認して確定できます。");
      }
    } catch { if (active.current && epoch.current === token && latest.current.value === selected) setMessage("推定住所を取得できませんでした。地図の位置を確認して確定できます。"); }
    finally { if (active.current) setReverseBusy(false); }
  }
  const warnings = locationWarnings(value, address, prefecture), saved = canSavePlace(value, address, prefecture);
  return <fieldset className="location-picker"><legend>開催場所の位置確認</legend>
    <p>開催場所の住所を検索します。入力例（架空）：東京都架空市テスト区検証町1-2-3。実際の開催住所を入力し、会場名は別欄に分けてください。番地データがない地域では町丁目付近の候補になる場合があります。</p>
    <p id="location-privacy">検索すると入力住所を、「推定住所を取得」すると選択座標を外部サービスへ送信します。個人宅・非公開住所は送信しないでください。住所取得を使わず地図の位置だけを確認することもできます。</p>
    <button type="button" disabled={busy || address.trim().length < 2} onClick={() => void search()}>{busy ? "住所を検索中…" : "住所を検索"}</button>
    <p role="status">{message}</p>
    {candidates.length > 0 && <ul className="place-results" aria-label="開催場所の検索候補">{candidates.map((candidate, i) => <li key={i}><button type="button" onClick={() => { epoch.current++; onChange(selectPlace(candidate, address, "search", candidate)); setMessage("候補の座標を地図中央に表示します。住所とピンの位置を確認して確定してください。"); }}>{candidate.label}<br/><small>所在地：{candidate.prefecture ?? "都道府県不明"} · {accuracyLabel(candidate.accuracy)}{candidate.townFallback ? "（番地を除いて再検索）" : ""}</small><br/><small>{accuracyNotice(candidate.accuracy, candidate.townFallback)}</small></button></li>)}</ul>}
    <p>検索データ：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>（Nominatim互換サービス）。住所検索が使えない場合も地図で指定できます。</p>
    <div ref={host} className="location-map" aria-label="開催場所を選ぶ地図" aria-describedby="location-keys" data-latitude={value?.latitude} data-longitude={value?.longitude} onKeyDown={event => { if (event.key === "Enter" && event.target === event.currentTarget && map.current) { event.preventDefault(); event.stopPropagation(); const p = map.current.getCenter().wrap(); manual.current({ latitude: p.lat, longitude: p.lng }); } }}/>
    <p id="location-keys">📍が選択地点です。地図クリック・ピンのドラッグで変更できます。キーボードでは地図を矢印キーで移動し、Enterキーでピンを置けます。</p>
    <button type="button" disabled={!value} onClick={() => { epoch.current++; onChange(null); setResults(null); setMessage(""); }}>選択を解除</button>
    <div className="location-adjust" aria-label="開催場所を約50メートル調整">{([ ["north", "北"], ["south", "南"], ["west", "西"], ["east", "東"] ] as const).map(([direction, label]) => <button key={direction} type="button" disabled={!value} onClick={() => value && manual.current(moveLocation(value, direction))}>{label}へ約50m</button>)}</div>
    <section className="location-review" aria-label="選択地点の確認">
      <p>入力住所：{address || "未入力"}</p>
      <p>保存する都道府県：{prefecture || "未判定（住所を詳しく入力するか補完してください）"}。手動指定だけでは県境との一致を自動検証できません。推定住所と地図で確認してください。</p>
      {value ? <><p>選択方法：{value.source === "search" ? "住所検索の候補" : value.source === "manual" ? "手動選択した地点（住所検索結果ではありません）" : "保存済みの地点（再確認してください）"}</p>
        <p>{value.matchedAddress ? `照合用の所在地住所：${value.matchedAddress}` : value.estimatedAddress ? `推定住所：${value.estimatedAddress}` : "地図から指定した位置（住所未取得）"}</p>
        {value.source === "manual" && <button type="button" disabled={reverseBusy || saved} onClick={() => void reverse()}>{reverseBusy ? "推定住所を取得中…" : "推定住所を取得"}</button>}
        {value.estimatedPrefecture && value.estimatedPrefecture !== prefecture && <p role="alert">推定住所は{value.estimatedPrefecture}です。近隣の住所の可能性もあるため、入力住所と地図を確認してください。</p>}
        <p>緯度：{value.latitude.toFixed(6)} / 経度：{value.longitude.toFixed(6)}</p>
        <p>{accuracyLabel(value.accuracy)}：{value.source === "search" ? accuracyNotice(value.accuracy, value.townFallback) : "手動選択・保存済みの位置も住所との一致を自動検証していません。建物・会場入口と照合してください。"}</p></> : <p>位置が未選択です。住所を検索するか、地図から指定してください。</p>}
      {value && requiresManualLocation(value) && <p role="alert">番地までの位置を確認できていないため、この候補はそのまま確定できません。地図で実際の会場を照合し、クリック・ピン移動・方向ボタンで手動指定してください。手動指定後も住所との一致を自動保証しません。</p>}
      {warnings.map(warning => <p role="alert" key={warning}>{warning} 住所・候補・都道府県を修正してください。</p>)}
      <button type="button" disabled={!canConfirmPlace(value, address, prefecture) || saved} onClick={() => value && onChange({ ...value, confirmed: true, confirmedPrefecture: prefecture })}>この位置で確定する</button>
      <p role="status">{saved ? "位置を確定しました。保存できます。" : "位置が未確定のため保存できません。住所とピンの位置を確認して「この位置で確定する」を押してください。"}</p>
    </section>
  </fieldset>;
}
