import { useEffect, useRef } from "react";
import type { DanceEvent } from "../types/event";
import { formatFee, formatPeriod } from "../lib/format";
export function EventDetail({
  event,
  onClose,
}: {
  event: DanceEvent | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (event && element && !element.open) element.showModal();
    if (!event && element?.open) element.close();
  }, [event]);
  return (
    <dialog
      ref={dialog}
      className="detail-dialog"
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="detail-title"
    >
      {event && (
        <>
          <div className="detail-top">
            <span className="demo-badge">デモデータ</span>
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
          <p className="field-help">
            架空のイベントです。実際の開催・参加募集はありません。
          </p>
          <button className="primary" onClick={onClose}>
            一覧に戻る
          </button>
        </>
      )}
    </dialog>
  );
}
