export interface UserProfile {
  id:number; email:string; dancerName:string; mainGenre:string|null; subGenres:string[];
  activityRegion:string|null; birthDate:string|null; birthYear:number|null;
  ageStatsConsent:boolean; genreStatsConsent:boolean;
}
export interface GroupInfo { id:number; name:string; role:"admin"|"member" }
export interface Invitation { id:string; expiresAt:string; revoked?:boolean; code?:string; path?:string }
export interface SessionInfo { user:UserProfile|null; csrfToken:string }
export async function api<T>(path:string, method="GET", body?:unknown):Promise<T> {
  const headers:Record<string,string>={};
  if(method!=="GET") {
    const session=await api<SessionInfo>("/auth/session");
    headers["X-CSRFToken"]=session.csrfToken;
    headers["Content-Type"]="application/json";
  }
  const response=await fetch(`/api${path}`,{method,credentials:"same-origin",headers,body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===204) return undefined as T;
  const data=await response.json().catch(()=>({error:"サーバーに接続できません。"}));
  if(!response.ok) {
    if(path==="/geocode" && response.status===404) throw new Error("住所検索APIが見つかりません。Flaskをこのプロジェクトの最新ソースで再起動し、Viteの接続先を確認してください。地図からも指定できます。");
    throw new Error(typeof data.error==="string"?data.error:"処理に失敗しました。");
  }
  return data as T;
}
