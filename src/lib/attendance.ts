export function attendanceSummary(count:number,capacity:number|null):string {
  return capacity===null?`${count}人が参加予定・定員なし`:`参加予定：${count} / ${capacity}人（残り${Math.max(0,capacity-count)}枠）`;
}
