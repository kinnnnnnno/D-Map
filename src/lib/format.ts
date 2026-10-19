const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export const formatPeriod = (start: string, end: string) =>
  `${dateFormat.format(new Date(start))} → ${dateFormat.format(new Date(end))}`;
export const formatFee = (fee: number) =>
  fee === 0 ? "無料" : `¥${fee.toLocaleString("ja-JP")}`;
