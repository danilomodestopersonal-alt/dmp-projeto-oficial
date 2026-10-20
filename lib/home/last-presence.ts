import type {Session} from "@/types/models";
export const LAST_PRESENCE_ENABLED=true;
export function lastConfirmedPresence(sessions:Session[],today:string){
 return sessions.filter(s=>["ATTENDANCE","PLANNED","FREE"].includes(s.source||"")&&(s.source==="ATTENDANCE"||!!s.finishedAt&&Number.isFinite(Date.parse(s.finishedAt)))&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&s.date<=today&&Number.isFinite(Date.parse(s.date+"T12:00:00Z"))&&new Date(s.date+"T12:00:00Z").toISOString().slice(0,10)===s.date).map(s=>s.date).sort().at(-1)||null;
}
