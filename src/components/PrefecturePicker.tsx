import { useEffect, useId, useRef, useState } from "react";
import type { Prefecture } from "../data/prefectures";
import { findPrefectures, prefectureSummary, togglePrefecture } from "../lib/prefectureSelection";
import { lockBodyOverflow } from "../lib/scrollLock";

export function PrefecturePicker({ selected, onChange }: {
  selected: readonly Prefecture[];
  onChange: (selected: Prefecture[]) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pressedOutside = useRef(false);
  useEffect(() => {
    if (!open || !panel.current) return;
    const element = panel.current;
    const opener = trigger.current;
    const release = lockBodyOverflow();
    element.showModal();
    search.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      release();
      opener?.focus({ preventScroll: true });
    };
  }, [open]);
  const matches = findPrefectures(query);
  const outside = (element: HTMLDialogElement, x: number, y: number) => {
    const rect = element.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  };
  return <div className="region-selector">
    <span className="live-dot" aria-hidden="true" />
    <button ref={trigger} type="button" className="region-trigger" aria-label="都道府県を選択"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id} aria-describedby={`${id}-selection`}
      onClick={() => { setQuery(""); setOpen(true); }}>
      <span id={`${id}-selection`}>{prefectureSummary(selected)}</span><span aria-hidden="true">▾</span>
    </button>
    <dialog ref={panel} id={id} className="prefecture-dialog" aria-modal="true" aria-labelledby={`${id}-title`}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); setOpen(false); }}
      onPointerDown={event => { pressedOutside.current = outside(event.currentTarget, event.clientX, event.clientY); }}
      onClick={event => {
        if (pressedOutside.current && outside(event.currentTarget, event.clientX, event.clientY)) setOpen(false);
        pressedOutside.current = false;
      }}
      onKeyDown={event => {
        if (event.key === "Escape") event.stopPropagation();
        if (event.key !== "Tab") return;
        event.stopPropagation();
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input')).filter(el => el.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="prefecture-panel-header">
        <h2 id={`${id}-title`}>都道府県を選択</h2>
        <button type="button" className="close-button" aria-label="都道府県選択を閉じる" onClick={() => setOpen(false)}>×</button>
      </div>
      <label htmlFor={`${id}-search`}>都道府県を検索</label>
      <input ref={search} id={`${id}-search`} type="search" value={query} placeholder="例：東京、神奈川"
        onChange={event => setQuery(event.target.value)} />
      <p className="field-help">複数選択できます。選択はすぐに反映されます。未選択は全国です。</p>
      <label className="prefecture-option">
        <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />全国
      </label>
      <fieldset className="prefecture-options"><legend className="sr-only">都道府県（複数選択可）</legend>
        {matches.map(([name]) => <label className="prefecture-option" key={name}>
          <input type="checkbox" checked={selected.includes(name)} onChange={() => onChange(togglePrefecture(selected, name))} />{name}
        </label>)}
        {!matches.length && <p role="status">一致する都道府県がありません。</p>}
      </fieldset>
      <div className="prefecture-panel-footer">
        <p role="status">選択中：{selected.length ? selected.join("・") : "全国"}</p>
        <button type="button" className="reset" onClick={() => onChange([])}>全選択解除</button>
        <button type="button" className="primary" onClick={() => setOpen(false)}>閉じる</button>
      </div>
    </dialog>
  </div>;
}
