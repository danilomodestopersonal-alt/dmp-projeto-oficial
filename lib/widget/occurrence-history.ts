import type {CalendarEvent,Session,Student} from "@/types/models";
import {getCalendarEventStudents,kidsCalendarRequest} from "./home-source";
import {occurrenceState} from "./attendance-state";
import {agendaAttendance} from "./agenda-attendance";

export type AttendanceDiagnostic={date:string;code:string;eventId?:string;studentId?:string};
export type WidgetOccurrence={event:CalendarEvent;students:Student[];states:ReturnType<typeof occurrenceState>[];historyOnly:boolean};
const dayFormatter=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"});
const localDay=(value:string)=>dayFormatter.format(new Date(value));
const instant=(value:string)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const timed=(e:NonNullable<Session["calendarEvent"]>)=>!e.allDay&&instant(e.start)&&instant(e.end)&&Date.parse(e.end)>Date.parse(e.start);
const sameTime=(a:NonNullable<Session["calendarEvent"]>,b:NonNullable<Session["calendarEvent"]>)=>Date.parse(a.start)===Date.parse(b.start)&&Date.parse(a.end)===Date.parse(b.end);
type RecordLink={student:Student;session:Session};

/** Read-only widget projection. Identity comes from saved occurrence IDs, never names or a shared time slot. */
export function widgetOccurrenceHistory(students:Student[],matched:CalendarEvent[],date:string){
 const diagnostics:AttendanceDiagnostic[]=[],groups=new Map<string,RecordLink[]>(),events=new Map<string,CalendarEvent>(),duplicates=new Set<string>();
 const diagnose=(code:string,eventId?:string,studentId?:string)=>diagnostics.push({date,code,...(eventId?{eventId}:{}),...(studentId?{studentId}:{})});
 for(const e of matched){
  if(events.has(e.id)){if(JSON.stringify(events.get(e.id))!==JSON.stringify(e)){duplicates.add(e.id);diagnose("duplicate-google-id",e.id);}continue;}
  events.set(e.id,e);
 }
 for(const student of students)for(const session of student.sessions||[]){
  if(session.date!==date)continue;
  const e=session.calendarEvent;
  if(!e?.id?.trim()){if(session.source==="ABSENCE")diagnose("unlinked-absence",undefined,student.id);continue;}
  const group=groups.get(e.id)||[];group.push({student,session});groups.set(e.id,group);
 }
 const projected:WidgetOccurrence[]=[];
 for(const id of new Set([...events.keys(),...groups.keys()])){
  const live=events.get(id),records=groups.get(id)||[],hasAbsence=records.some(r=>r.session.source==="ABSENCE");
  const liveToday=live&&!live.cancelled&&(live.allDay?live.start.slice(0,10)===date:instant(live.start)&&localDay(live.start)===date);
  const participants=liveToday?getCalendarEventStudents(live,students):[];
  // Legacy records sometimes contain only an ID. A currently loaded event can
  // supply its own time; a missing event always requires a complete saved time.
  const valid=(e:NonNullable<Session["calendarEvent"]>)=>timed(e)&&localDay(e.start)===date;
  const invalid=records.some(r=>{const e=r.session.calendarEvent!;return !r.student.id?.trim()||!r.student.name?.trim()||!(valid(e)||(liveToday&&timed(live)&&!e.allDay&&!e.start&&!e.end));});
  const first=records.map(r=>r.session.calendarEvent!).find(valid);
  const conflict=Boolean(first&&records.some(r=>timed(r.session.calendarEvent!)&&!sameTime(first,r.session.calendarEvent!)));
  const moved=Boolean(live&&first&&!live.cancelled&&(!timed(live)||!sameTime(live,first)));
  const blocked=invalid||conflict||moved||duplicates.has(id);
  if(invalid)diagnose("invalid-snapshot",id);
  else if(conflict)diagnose("conflicting-snapshots",id);
  else if(moved)diagnose("moved-occurrence",id);
  // A deleted ordinary appointment or an unlinked day-level absence is not a lesson to reconstruct.
  if(!liveToday&&(!hasAbsence||!first||blocked))continue;
  if(liveToday&&kidsCalendarRequest(live)){projected.push({event:live,students:participants,states:[],historyOnly:false});continue;}
  if(!liveToday&&first&&kidsCalendarRequest(first)){diagnose("non-personal-history",id);continue;}
  const people=new Map(participants.map(s=>[s.id,s]));
  if(!blocked)for(const r of records)people.set(r.student.id,r.student);
  const ss=[...people.values()],historyOnly=!liveToday;
  if(historyOnly&&!ss.length)continue;
  const event:CalendarEvent=liveToday?live:{id,summary:"Aula",start:first!.start,end:first!.end,description:"",location:"",matchedStudentIds:ss.map(s=>s.id),matchedStudentId:ss[0]?.id||null};
  const states=ss.map(s=>{
   let state=blocked&&records.some(r=>r.student.id===s.id)?{studentId:s.id,state:"unknown" as const,reason:"occurrence-conflict"}:occurrenceState(s,id,date);
   if(!blocked){
    const candidates=[...events.values()].filter(e=>!e.cancelled&&!e.allDay&&instant(e.start)&&localDay(e.start)===date&&!kidsCalendarRequest(e)&&getCalendarEventStudents(e,students).some(p=>p.id===s.id));
    state=agendaAttendance(s,id,date,candidates.length===1&&candidates[0].id===id);
    const linked=records.filter(r=>r.student.id===s.id);
    if(linked.some(r=>r.session.source==="ABSENCE")&&linked.some(r=>r.session.source!=="ABSENCE"))diagnose("conflicting-records",id,s.id);
   }
   if(state.state==="unknown")diagnose(state.reason||"unknown-state",id,s.id);
   return state;
  });
  projected.push({event,students:ss,states,historyOnly});
 }
 return {occurrences:projected,diagnostics};
}

/** Emoji X is understood by the existing Android 0.3.8 title renderer; raw student names stay unchanged. */
export function widgetOccurrenceTitle(item:WidgetOccurrence){
 if(!item.students.length||!item.states.some(s=>s.state!=="pending"))return item.event.summary;
 return item.students.map((s,i)=>`${item.states[i]?.state==="absent"?"❌ ":item.states[i]?.state==="present"?"✅ ":""}${s.name}${item.states[i]?.state==="pending"?" (pendente)":""}`).join(" · ");
}
