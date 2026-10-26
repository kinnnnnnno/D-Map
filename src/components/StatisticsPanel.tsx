import {useEffect,useState} from "react";
import {api} from "../services/api";
interface Breakdown {available:boolean;targetCount?:number;items?:{label:string;count:number;percentage:number}[];averageAge?:number|null;averageNote?:string;message?:string;method?:string}
interface Statistics {age:Breakdown;genre:Breakdown}
export function StatisticsPanel({eventId,version}:{eventId:string;version:number}) {
  const [data,setData]=useState<Statistics|null>(null),[error,setError]=useState(""),[reload,setReload]=useState(0),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);setError("");api<Statistics>(`/events/${eventId}/statistics`).then(value=>{if(active)setData(value);}).catch(error=>{if(active){setData(null);setError(error instanceof Error?error.message:"統計を取得できません。");}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[eventId,version,reload]);
  const chart=(title:string,value:Breakdown)=><section aria-label={title}><h4>{title}</h4>{value.available?<><p>集計対象：{value.targetCount}人</p><ul className="statistics-bars">{value.items?.map(item=><li key={item.label}><span>{item.label}：{item.count}人（{item.percentage}%）</span><meter aria-label={`${item.label}の割合`} min={0} max={100} value={item.percentage}/></li>)}</ul>{title==="年齢層"&&<p>{value.averageAge==null?"平均年齢は非表示":`平均年齢：${value.averageAge}歳`}{" / "}{value.averageNote}</p>}</>:<p>{value.message}</p>}{value.method&&<p>{value.method}</p>}</section>;
  return <section className="statistics-panel" aria-label="参加予定者の統計"><h3>参加予定者の統計</h3><p>取得時点の匿名集計です。少人数の場合は内訳を非表示にします。</p><button type="button" disabled={loading} onClick={()=>setReload(value=>value+1)}>統計を更新</button>{loading?<p role="status">統計を確認中…</p>:data&&<>{chart("年齢層",data.age)}{chart("ジャンル",data.genre)}</>}{error&&<p role="alert">{error}</p>}</section>;
}
