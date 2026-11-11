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
export function matchCalendarEvents(events:CalendarEvent[],students:Student[],maintenanceCandidates=false):CalendarEvent[]{
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
    // Maintenance discovers candidates first and independently checks identity, ownership and conflicts.
    if(maintenanceCandidates)return projectRoster(event,matches.map(s=>s.id),students);
    const roster=event.calendarRoster;
    const edits=[...(roster?.rules||[]),...(roster?.single?.eventId===event.id?[roster.single]:[])];
    const knownTokens=new Set(students.flatMap(s=>normalizeName(s.name).split(" ")));
    const onlyRoster=Boolean(title)&&[...tokens].every(token=>["aula","personal","treino","e","de","do","da"].includes(token)||knownTokens.has(token)||token.length>=3&&[...knownTokens].some(n=>n.startsWith(token)));
    const lessonLabel=/^(aula|personal|treino)\b/.test(title);
    // Stored occurrence IDs tie historical rosters to the same Google series.
    // A similar name, weekday or time is never sufficient evidence.
    const seriesKey=(id:string)=>id.replace(/_R\d{8}T\d{6}(?:Z)?$/,"");
    const instanceSeries=(id:string)=>/_\d{8}T\d{6}Z$/.test(id)?id.replace(/_\d{8}T\d{6}Z$/,""):null;
    const lessonLinks=new Set(matches.filter(student=>{
      const explicit=edits.some(edit=>[...edit.ids,...edit.add,...edit.remove].includes(student.id));
      const historical=student.sessions?.some(session=>{
        const previous=session.calendarEvent;if(!previous)return false;
        return previous.id===event.id||Boolean((event.recurringEventId||event.recurrence?.length)&&instanceSeries(previous.id)===seriesKey(event.recurringEventId||event.id));
      });
      return explicit||historical;
    }).map(student=>student.id));
    const ids=onlyRoster&&(lessonLabel||lessonLinks.size)?matches.filter(student=>lessonLinks.has(student.id)||matches.filter(other=>normalizeName(other.name)===normalizeName(student.name)).length===1).map(student=>student.id):[];
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
