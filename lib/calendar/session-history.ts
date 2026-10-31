import type {Session} from "@/types/models";
export function isRealizedSession(session:Session,today:string):boolean {
 const state=(session as Session & {status?:string}).status;
 return session.source!=="ABSENCE" && /^\d{4}-\d{2}-\d{2}$/.test(session.date) && session.date<=today
  && !["PENDING","SCHEDULED","CANCELLED","CANCELED","ABSENT"].includes(state||"")
  && (!session.calendarEvent || !((session.calendarEvent as unknown as {cancelled?:boolean}).cancelled))
  && (!session.startedAt || Boolean(session.finishedAt) || session.source==="ATTENDANCE" || session.source==="IMPORTED");
}
