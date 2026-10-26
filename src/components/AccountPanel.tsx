import { useEffect, useState, type FormEvent } from "react";
import { api, type GroupInfo, type Invitation, type SessionInfo, type UserProfile } from "../services/api";
import { genres, type DanceEvent } from "../types/event";
import { prefectures } from "../data/prefectures";
import { Modal } from "./Modal";
import { EventEditor } from "./EventEditor";
interface Member {id:number;dancerName:string;role:string}
export function AccountPanel({user,onUser,onChanged}:{user:UserProfile|null;onUser:(user:UserProfile|null)=>void;onChanged:()=>void}) {
  const [open,setOpen]=useState(false),[tab,setTab]=useState("login"),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [groups,setGroups]=useState<GroupInfo[]>([]),[events,setEvents]=useState<DanceEvent[]>([]);
  const [members,setMembers]=useState<Member[]>([]),[invitations,setInvitations]=useState<Invitation[]>([]),[code,setCode]=useState<Invitation|null>(null);
  const [selectedGroup,setSelectedGroup]=useState<GroupInfo|null>(null),[editor,setEditor]=useState<DanceEvent|null|undefined>(undefined);
  const [inviteCode,setInviteCode]=useState(()=>location.hash.startsWith("#invite=")?location.hash.slice(8):"");
  useEffect(()=>{if(location.hash.startsWith("#invite=")) history.replaceState(null,"",location.pathname+location.search);},[]);
  useEffect(()=>{if(inviteCode){setOpen(true);setTab(user?"groups":"login");}},[inviteCode,user]);
  async function load() {
    if(!user) return;
    const [groups,events]=await Promise.all([api<GroupInfo[]>("/groups"),api<DanceEvent[]>("/events")]);
    setGroups(groups);setEvents(events);
  }
  async function run(action:()=>Promise<void>) {
    if(busy) return;setBusy(true);setError("");setMessage("");
    try{await action();}catch(error){setError(error instanceof Error?error.message:"処理に失敗しました。");}finally{setBusy(false);}
  }
  function profileBody(form:HTMLFormElement) {
    const data=new FormData(form);
    return {dancerName:data.get("dancerName"),mainGenre:data.get("mainGenre")||null,subGenres:data.getAll("subGenres"),activityRegion:data.get("activityRegion")||null,
      birthDate:data.get("birthDate")||null,birthYear:data.get("birthYear")?Number(data.get("birthYear")):null,
      ageStatsConsent:data.has("ageStatsConsent"),genreStatsConsent:data.has("genreStatsConsent")};
  }
  function authenticate(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=e.currentTarget;const data=new FormData(form);
    void run(async()=>{const result=await api<SessionInfo>(`/auth/${tab}`,"POST",{email:data.get("email"),password:data.get("password"),...(tab==="register"?profileBody(form):{})});onUser(result.user);onChanged();setTab("profile");setMessage("ログインしました。");});
  }
  const profileFields=(value:UserProfile|null)=><>
    <label>ダンサーネーム<input name="dancerName" required maxLength={60} defaultValue={value?.dancerName}/></label>
    <label>メインジャンル<select aria-label="メインジャンル" name="mainGenre" defaultValue={value?.mainGenre??""}><option value="">未登録</option>{genres.map(g=><option key={g}>{g}</option>)}</select></label>
    <fieldset><legend>サブジャンル（任意・複数）</legend><div className="checkbox-grid">{genres.map(g=><label key={g}><input type="checkbox" name="subGenres" value={g} defaultChecked={value?.subGenres.includes(g)}/>{g}</label>)}</div></fieldset>
    <label>活動地域<select aria-label="活動地域" name="activityRegion" defaultValue={value?.activityRegion??""}><option value="">未登録</option>{prefectures.map(([name])=><option key={name}>{name}</option>)}</select></label>
    <p>年齢情報は非公開です。生年または生年月日のどちらか一方だけ、任意で入力できます。</p>
    <label>生年（任意）<input name="birthYear" type="number" min={1900} max={2100} defaultValue={value?.birthYear??""}/></label>
    <label>生年月日（任意）<input name="birthDate" type="date" defaultValue={value?.birthDate??""}/></label>
    <label className="check-label"><input name="ageStatsConsent" type="checkbox" defaultChecked={value?.ageStatsConsent}/>年齢統計への参加に同意する（任意・後から取消可）</label>
    <label className="check-label"><input name="genreStatsConsent" type="checkbox" defaultChecked={value?.genreStatsConsent}/>メインジャンルの匿名集計に同意する（任意）</label>
  </>;
  return <><button type="button" className="account-launch" onClick={()=>{setOpen(true);setTab(user?"profile":"login");setError("");setMessage("");}}>{user?`${user.dancerName} / アカウント`:"ログイン・登録"}</button>
    {open&&<Modal title="アカウント" onClose={()=>setOpen(false)}>
      <nav className="account-tabs" aria-label="アカウントメニュー">
        {(!user?[['login','ログイン'],['register','ユーザー登録']]:[['profile','プロフィール'],['groups','グループ'],['events','イベント管理']]).map(([key,label])=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>{setTab(key);setSelectedGroup(null);setError("");setMessage("");if(user) void run(load);}}>{label}</button>)}
      </nav>
      {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
      {!user&&<form className="account-form" onSubmit={authenticate}>
        <label>メールアドレス<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
        <label>パスワード（12〜128文字）<input name="password" type="password" autoComplete={tab==="register"?"new-password":"current-password"} required minLength={12} maxLength={128}/></label>
        {tab==="register"&&profileFields(null)}
        <button className="primary" disabled={busy}>{busy?"処理中…":tab==="register"?"登録する":"ログインする"}</button>
      </form>}
      {user&&tab==="profile"&&<form key={user.id} className="account-form" onSubmit={e=>{e.preventDefault();const data=profileBody(e.currentTarget);void run(async()=>{onUser(await api<UserProfile>("/profile","PUT",data));setMessage("プロフィールを保存しました。");});}}>
        <p>ログイン中：{user.email}</p>{profileFields(user)}<button className="primary" disabled={busy}>プロフィールを保存</button>
        <button type="button" disabled={busy} onClick={()=>void run(async()=>{await api("/auth/logout","POST");onUser(null);onChanged();setTab("login");setGroups([]);setEvents([]);setMessage("ログアウトしました。");})}>ログアウト</button>
      </form>}
      {user&&tab==="groups"&&<div className="account-form">
        <form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void run(async()=>{await api("/groups","POST",{name:data.get("name")});await load();setMessage("グループを作成しました。");});}}><label>新しいグループ名<input name="name" required maxLength={80}/></label><button disabled={busy}>グループ作成</button></form>
        <form onSubmit={e=>{e.preventDefault();void run(async()=>{await api("/groups/join","POST",{code:inviteCode});setInviteCode("");await load();onChanged();setMessage("グループに参加しました。");});}}><label>招待コード<input value={inviteCode} onChange={e=>setInviteCode(e.target.value)} required maxLength={100}/></label><button disabled={busy}>招待で参加</button></form>
        <ul>{groups.map(group=><li key={group.id}><button disabled={busy} onClick={()=>void run(async()=>{setSelectedGroup(group);setMembers(await api<Member[]>(`/groups/${group.id}/members`));setCode(null);setInvitations(group.role==="admin"?await api<Invitation[]>(`/groups/${group.id}/invitations`):[]);})}>{group.name}（{group.role==="admin"?"管理者":"メンバー"}）</button></li>)}</ul>
        {selectedGroup&&<section aria-label="グループのメンバー"><h3>{selectedGroup.name}</h3><ul>{members.map(member=><li key={member.id}>{member.dancerName} / {member.role==="admin"?"管理者":"メンバー"}</li>)}</ul>
          {selectedGroup.role==="admin"&&<><button disabled={busy} onClick={()=>void run(async()=>{const value=await api<Invitation>(`/groups/${selectedGroup.id}/invitations`,"POST");setCode(value);setInvitations(await api<Invitation[]>(`/groups/${selectedGroup.id}/invitations`));})}>招待を作成</button>
          {code&&<div role="status"><p>招待コード：<output aria-label="発行した招待コード">{code.code}</output></p><p>招待リンク：<a href={code.path}>{location.origin}{code.path}</a></p><p>期限：{new Date(code.expiresAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})} JST</p></div>}
          <ul>{invitations.map(invite=><li key={invite.id}>{new Date(invite.expiresAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})} JST / {invite.revoked?"無効":"発行済み"}<button disabled={busy||invite.revoked} onClick={()=>void run(async()=>{await api(`/groups/${selectedGroup.id}/invitations/${invite.id}`,"DELETE");setInvitations(await api<Invitation[]>(`/groups/${selectedGroup.id}/invitations`));setCode(null);setMessage("招待を無効化しました。");})}>無効化</button></li>)}</ul></>}
        </section>}
      </div>}
      {user&&tab==="events"&&<section><button className="primary" onClick={()=>setEditor(null)}>イベント作成</button><ul>{events.filter(event=>event.visibility==="public"?event.creatorId===user.id:groups.some(group=>group.id===event.groupId&&group.role==="admin")).map(event=><li key={event.id}>{event.title}<button onClick={()=>setEditor(event)}>編集</button><button disabled={busy} onClick={()=>void run(async()=>{if(!confirm(`「${event.title}」を削除しますか？`)) return;await api(`/events/${event.id}`,"DELETE");await load();onChanged();setMessage("イベントを削除しました。");})}>削除</button></li>)}</ul></section>}
    </Modal>}
    {editor!==undefined&&user&&<EventEditor event={editor} user={user} groups={groups} onClose={()=>setEditor(undefined)} onSaved={()=>{void run(load);onChanged();setMessage("イベントを保存しました。");}}/>}
  </>;
}
