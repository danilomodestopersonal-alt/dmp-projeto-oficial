import {projectRoster} from "@/lib/calendar/roster";
// Funções oficiais copiadas literalmente da Home; teste de paridade impede divergência.
import type {CalendarEvent,Student} from "@/types/models";
import type {KidsCategory} from "@/types/kids";
type KidsLessonOpenRequest={date:string;time:string;category:KidsCategory;lessonId?:string};
const CALENDAR_STUDENT_ALIASES:Record<string,string>={bruna:"bruna sickler"};
export function normalizeName(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();}
export function kidsCalendarRequest(event:CalendarEvent):KidsLessonOpenRequest|null{
  if(event.allDay)return null;
  const name=normalizeName(event.summary);
  let category:KidsCategory|null=null;
  if(/\b(vermelho|vermelha)\b/.test(name))category="RED";
  else if(/\blaranja\b/.test(name))category="ORANGE";
  else if(/\bverde\b/.test(name))category="GREEN";
  else if(/\b(amarelo|amarela)\b/.test(name))category="YELLOW";
  if(!category)return null;
  const date=new Date(event.start);
  const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(date);
  const read=(type:string)=>parts.find(part=>part.type===type)?.value||"";
  const lessonId=event.id.startsWith("dmp-kids:")?event.id.slice("dmp-kids:".length):undefined;
  return {date:`${read("year")}-${read("month")}-${read("day")}`,time:`${read("hour")}:${read("minute")}`,category,lessonId};
}
export function categoryLabelForHome(category:KidsCategory){
  if(category==="RED")return "Vermelha";
  if(category==="ORANGE")return "Laranja";
  if(category==="GREEN")return "Verde";
  return "Amarela";
}
export function matchCalendarEvents(events:CalendarEvent[],students:Student[]):CalendarEvent[]{
  const active=students.filter(student=>student.status==="ACTIVE");
  const firstNameCount=new Map<string,number>();
  active.forEach(student=>{const first=normalizeName(student.name).split(" ").filter(Boolean)[0];if(first)firstNameCount.set(first,(firstNameCount.get(first)||0)+1);});
  return events.map(event=>{
    if(event.allDay)return {...event,matchedStudentId:null,matchedStudentIds:[]};
    const title=normalizeName(event.summary||"");
    // A identificação automática de alunos usa somente o título.
    // Descrição e local podem conter nomes de ruas ou outras pessoas e não devem
    // transformar compromissos pessoais em atendimentos de alunos.
    const searchable=title;
    const padded=` ${searchable} `;
    const tokens=new Set(searchable.split(" ").filter(Boolean));
    const matches=active.filter(student=>{
      const full=normalizeName(student.name);
      const parts=full.split(" ").filter(part=>part.length>1);
      if(!parts.length)return false;
      const first=parts[0];
      const firstLast=parts.length>=2?`${first} ${parts[parts.length-1]}`:"";
      if(full&&padded.includes(` ${full} `))return true;
      if(firstLast&&padded.includes(` ${firstLast} `))return true;
      if([...tokens].some(token=>CALENDAR_STUDENT_ALIASES[token]===full))return true;
      if(first.length>=3&&firstNameCount.get(first)===1&&tokens.has(first))return true;
      // Aceita qualquer parte única do nome, inclusive sobrenomes usados na agenda.
      if(parts.some(part=>{
        if(part.length<3||!tokens.has(part))return false;
        const candidates=active.filter(item=>normalizeName(item.name).split(" ").filter(Boolean).includes(part));
        return candidates.length===1&&candidates[0].id===student.id;
      }))return true;
      // Aceita abreviações como "Gra" somente quando apontam para um único aluno ativo.
      return [...tokens].some(token=>{
        if(token.length<3||!first.startsWith(token))return false;
        const candidates=active.filter(item=>normalizeName(item.name).split(" ").filter(Boolean)[0]?.startsWith(token));
        return candidates.length===1&&candidates[0].id===student.id;
      });
    });
    const ids=matches.map(student=>student.id);
    return projectRoster(event,ids,students);
  });
}
export function getCalendarEventStudents(event:CalendarEvent,students:Student[]):Student[]{
  if(kidsCalendarRequest(event))return [];
  const ids=event.matchedStudentIds?.length
    ?event.matchedStudentIds
    :(event.matchedStudentId?[event.matchedStudentId]:[]);
  return ids
    .map(id=>students.find(student=>student.id===id))
    .filter((student):student is Student=>Boolean(student));
}
export function calendarEventDate(event:CalendarEvent){return event.start.slice(0,10);}
