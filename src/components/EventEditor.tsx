import { useState, type FormEvent } from "react";
import { genres, eventTypes, type DanceEvent } from "../types/event";
import { prefectures } from "../data/prefectures";
import { api, type GroupInfo, type UserProfile } from "../services/api";
import { Modal } from "./Modal";
import { LocationPicker } from "./LocationPicker";
import { addressPrefecture, canSavePlace, resolvePrefecture, selectPlace, type SelectedPlace } from "../lib/location";
export function EventEditor({event,user,groups,onClose,onSaved}:{event:DanceEvent|null;user:UserProfile;groups:GroupInfo[];onClose:()=>void;onSaved:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [visibility,setVisibility]=useState(event?.visibility??"public");
  const [address,setAddress]=useState(event?.address??"");
  const [location,setLocation]=useState<SelectedPlace|null>(event?selectPlace(event,event.address,"existing"):null);
  const [prefectureSupplement,setPrefectureSupplement]=useState(event?.prefecture??"");
  const resolved = resolvePrefecture(address,location,prefectureSupplement);
  const prefecture = resolved.name;
  const needsSupplement = !addressPrefecture(address) && !location?.matchedPrefecture && (!!prefectureSupplement || !location?.estimatedPrefecture);
  const jst=(iso?:string)=>iso?new Date(Date.parse(iso)+9*3600000).toISOString().slice(0,16):"";
  async function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(busy) return; if(!canSavePlace(location,address,prefecture)){setError("住所と開催場所を確認し、この位置で確定してください。");return;} setBusy(true);setError("");
    const data=Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(`/events${event?`/${event.id}`:""}`,event?"PUT":"POST",{...data,visibility,prefecture,
        startAt:`${data.startAt}:00+09:00`,endAt:`${data.endAt}:00+09:00`,
        latitude:location.latitude,longitude:location.longitude,feeYen:Number(data.feeYen),
        groupId:visibility==="group"?Number(event?.groupId??data.groupId):null,
        capacity:data.capacity?Number(data.capacity):null,walkIns:data.walkIns==="on"});
      onSaved();onClose();
    }catch(error){setError(error instanceof Error?error.message:"保存できませんでした。");}finally{setBusy(false);}
  }
  return <Modal title={event?"イベント編集":"イベント作成"} onClose={onClose}>
    <form className="account-form" onSubmit={save}>
      <label>イベント名<input name="title" maxLength={120} required defaultValue={event?.title}/></label>
      <label>イベント種別<select aria-label="イベント種別" name="type" defaultValue={event?.type}>{eventTypes.map(type=><option key={type}>{type}</option>)}</select></label>
      <label>イベントジャンル<select aria-label="イベントジャンル" name="genre" defaultValue={event?.genre}>{genres.map(genre=><option key={genre}>{genre}</option>)}</select></label>
      <label>開始日時（日本時間）<input name="startAt" type="datetime-local" required defaultValue={jst(event?.startAt)}/></label>
      <label>終了日時（日本時間）<input name="endAt" type="datetime-local" required defaultValue={jst(event?.endAt)}/></label>
      <label>施設名・会場名<input name="venueName" maxLength={120} required defaultValue={event?.venueName}/></label>
      <label>開催場所の住所<input name="address" placeholder="東京都架空市テスト区検証町1-2-3" maxLength={250} required value={address} aria-describedby="location-privacy" onChange={e=>{setAddress(e.target.value);setLocation(null);setPrefectureSupplement("");}} onKeyDown={e=>{if(e.key==="Enter")e.preventDefault();}}/></label>
      <p role="status" aria-label="開催場所の都道府県">都道府県：{prefecture || "未判定"} · {resolved.source}</p>
      {needsSupplement && <><label>都道府県を補完（判定できない場合）<input list="event-prefecture-options" value={prefectureSupplement} onChange={e=>{setPrefectureSupplement(e.target.value);setLocation(current=>current?{...current,confirmed:false}:null);}}/></label><datalist id="event-prefecture-options">{prefectures.map(([name])=><option key={name} value={name}/>)}</datalist><p>正式名称を入力してください。未判定のままでは位置を確定・保存できません。</p></>}
      <LocationPicker value={location} address={address} prefecture={prefecture} onChange={setLocation}/>
      <label>参加費（円）<input name="feeYen" type="number" min={0} max={1000000} step={1} required defaultValue={event?.feeYen??0}/></label>
      <label>主催者名<input name="organizerName" maxLength={80} required defaultValue={event?.organizerName??user.dancerName}/></label>
      <label>参加条件<textarea name="participationRule" maxLength={500} required defaultValue={event?.participationRule}/></label>
      <label>説明<textarea name="description" maxLength={5000} required defaultValue={event?.description}/></label>
      <label>公開範囲<select aria-label="公開範囲" value={visibility} disabled={!!event} onChange={e=>setVisibility(e.target.value as "public"|"group")}><option value="public">公開</option><option value="group">グループ限定</option></select></label>
      {visibility==="group"&&<label>所属グループ<select aria-label="所属グループ" name="groupId" required disabled={!!event} defaultValue={event?.groupId??undefined}>{groups.filter(group=>group.role==="admin").map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
      <label>開催状態<select aria-label="開催状態" name="status" defaultValue={event?.status??"scheduled"}><option value="scheduled">開催予定</option><option value="cancelled">中止</option></select></label>
      <label>定員（空欄は定員なし）<input name="capacity" type="number" step={1} min={1} max={1000000} defaultValue={event?.capacity??""}/></label>
      <label className="check-label"><input name="walkIns" type="checkbox" defaultChecked={event?.walkIns}/>飛び入り参加OK</label>
      {error&&<p role="alert">{error}</p>}
      <button className="primary" disabled={busy || !canSavePlace(location,address,prefecture)}>{busy?"保存中…":"保存する"}</button>
    </form>
  </Modal>;
}
