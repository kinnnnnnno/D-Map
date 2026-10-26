import { useEffect, useState } from "react";
import type { DanceEvent } from "../types/event";
import type { UserProfile } from "../services/api";
import { api } from "../services/api";
import { attendanceSummary } from "../lib/attendance";
import { StatisticsPanel } from "./StatisticsPanel";
export function ParticipationPanel({event,user}:{event:DanceEvent;user:UserProfile|null}) {
  const [current,setCurrent]=useState(event),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [version,setVersion]=useState(0);
  useEffect(()=>{let active=true;api<DanceEvent>(`/events/${event.id}`).then(value=>{if(active)setCurrent(value);}).catch(error=>{if(active)setError(error instanceof Error?error.message:"取得できません。");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[event.id]);
  async function change() {
    if(busy) return;setBusy(true);setError("");
    try{setCurrent(await api<DanceEvent>(`/events/${event.id}/participation`,current.attending?"DELETE":"POST",{}));setVersion(value=>value+1);}
    catch(error){
      setError(error instanceof Error?error.message:"参加情報を更新できません。");
      const latest=await api<DanceEvent>(`/events/${event.id}`).catch(()=>null);
      if(latest){setCurrent(latest);setVersion(value=>value+1);}
    }finally{setBusy(false);}
  }
  const ended=Date.parse(current.endAt)<=Date.now();
  return <section className="participation-panel" aria-label="参加予定">
    <h3>参加予定</h3><p>実際の来場・出席人数ではありません。</p>
    {loading?<p role="status">参加情報を確認中…</p>:<p role="status">{attendanceSummary(current.attendanceCount??0,current.capacity??null)}</p>}
    <p>{current.walkIns?"飛び入り参加OK":"飛び入り参加は主催者に確認してください。"}</p>
    {current.status==="cancelled"&&<p>このイベントは中止されています。</p>}
    {user?<button className="primary" disabled={busy||loading||(!current.attending&&(current.status==="cancelled"||ended||current.remainingSlots===0))} onClick={()=>void change()}>{busy?"更新中…":current.attending?"参加予定を取り消す":"参加予定にする"}</button>:<p>参加表明にはログインが必要です。詳細を閉じ、画面上部からログインしてください。</p>}
    {error&&<p role="alert">{error}</p>}
    <StatisticsPanel eventId={event.id} version={version}/>
  </section>;
}
