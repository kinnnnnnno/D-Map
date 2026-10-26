import { useEffect, useRef } from "react";
import type { DanceEvent } from "../types/event";
import { formatFee, formatPeriod } from "../lib/format";
import { lockBodyOverflow } from "../lib/scrollLock";
import { ParticipationPanel } from "./ParticipationPanel";
import type { UserProfile } from "../services/api";
import { VenueMap } from "./VenueMap";
export function EventDetail({
  event,
  onClose,
  user = null,
}: {
  event: DanceEvent | null;
  onClose: () => void;
  user?: UserProfile|null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const isOpen = event !== null;
  useEffect(() => {
    const element = dialog.current;
    if (!isOpen || !element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const x = window.scrollX, y = window.scrollY;
    const body = document.body;
    const properties = ["position", "top", "left", "width", "padding-right"] as const;
    const saved = properties.map(property => [property, body.style.getPropertyValue(property), body.style.getPropertyPriority(property)]);
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    const releaseOverflow = lockBodyOverflow();
    body.style.position = "fixed";
    body.style.top = `${-y}px`;
    body.style.left = `${-x}px`;
    body.style.width = "100%";
    if (gap > 0) body.style.paddingRight = `${padding + gap}px`;
    element.showModal();
    element.querySelector<HTMLButtonElement>(".close-button")?.focus({ preventScroll: true });
    return () => {
      element.close();
      saved.forEach(([property, value, priority]) => {
        if (value) body.style.setProperty(property, value, priority);
        else body.style.removeProperty(property);
      });
      releaseOverflow();
      window.scrollTo({ left: x, top: y, behavior: "instant" });
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isOpen]);
  const backdropPress = useRef(false);
  function outside(element: HTMLDialogElement, x: number, y: number) {
    const rect = element.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  }
  return (
    <dialog
      ref={dialog}
      className="detail-dialog"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onPointerDown={event => { backdropPress.current = outside(event.currentTarget, event.clientX, event.clientY); }}
      onClick={event => {
        if (backdropPress.current && outside(event.currentTarget, event.clientX, event.clientY)) onClose();
        backdropPress.current = false;
      }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      aria-modal="true"
      aria-labelledby="detail-title"
    >
      {event && (
        <>
          <div className="detail-top">
            {event.isDemo !== false && <span className="demo-badge">デモデータ</span>}
            <button
              className="close-button"
              onClick={onClose}
              aria-label="詳細を閉じる"
            >
              ×
            </button>
          </div>
          <p className="genre">
            {event.genre} / {event.type}
          </p>
          <h2 id="detail-title">{event.title}</h2>
          <p className="description">{event.description}</p>
          <dl>
            <dt>日時（日本時間）</dt>
            <dd>{formatPeriod(event.startAt, event.endAt)}</dd>
            <dt>会場</dt>
            <dd>
              {event.venueName}
              <br />
              <span>{event.address}</span>
            </dd>
            <dt>参加費</dt>
            <dd>{formatFee(event.feeYen)} / 人</dd>
            <dt>ジャンル</dt>
            <dd>{event.genre}</dd>
            <dt>イベント種別</dt>
            <dd>{event.type}</dd>
            <dt>参加条件</dt>
            <dd>{event.participationRule}</dd>
            <dt>主催者</dt>
            <dd>{event.organizerName}</dd>
          </dl>
          <VenueMap latitude={event.latitude} longitude={event.longitude}/>
          {typeof event.attendanceCount === "number" && <ParticipationPanel key={event.id} event={event} user={user}/>}
          {event.isDemo !== false && <p className="field-help">
            架空のイベントです。実際の開催・参加募集はありません。
          </p>}
          <button className="primary" onClick={onClose}>
            一覧に戻る
          </button>
        </>
      )}
    </dialog>
  );
}
