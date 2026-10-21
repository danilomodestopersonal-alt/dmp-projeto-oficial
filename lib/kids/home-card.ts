import type {KidsCategory, KidsData, KidsLesson, KidsStudent} from "@/types/kids";
import {kidsLessonClass} from "./class-history";

type Request={date:string;time:string;category:KidsCategory;lessonId?:string};
export type HomeKidsStudent={id:string;name:string;inactive:boolean;state:"present"|"absent"|"pending";canOpenAttendance:boolean};
export type HomeKidsCardData={lessonId?:string;name?:string;teacher?:string;endTime?:string;status?:string;students:HomeKidsStudent[];notice?:string};
const statuses={SCHEDULED:"Agendada",COMPLETED:"Realizada",CANCELLED:"Cancelada",HOLIDAY:"Feriado"};

// Read the saved payload. normalizeKidsData can infer attendance from elapsed time,
// which is not evidence of a confirmed presence on this card.
export function homeKidsCard(data:KidsData|null,request:Request):HomeKidsCardData{
  const unavailable=(notice:string):HomeKidsCardData=>({students:[],notice});
  if(!data)return unavailable("Consulte a lista de alunos na chamada.");
  // Match the existing KidsPage navigation contract, requiring one exact result.
  const matches=data.lessons.filter(lesson=>{
    if(request.lessonId)return lesson.id===request.lessonId;
    const group=data.classes.find(item=>item.id===lesson.classId);
    return lesson.date===request.date&&(lesson.replacementCategory||group?.category)===request.category&&(lesson.replacementStartTime||group?.startTime)===request.time;
  });
  if(matches.length!==1)return unavailable(matches.length?"Mais de uma aula corresponde a este horário. Confira na chamada.":"Lista de alunos ainda não vinculada a esta aula.");
  const lesson:KidsLesson=matches[0],group=kidsLessonClass(data,lesson);
  if(lesson.date!==request.date||(lesson.replacementCategory||group?.category)!==request.category||(lesson.replacementStartTime||group?.startTime)!==request.time)return unavailable("Os dados desta aula mudaram. Confira na chamada.");
  const attendance=lesson.attendance||{};
  const open=["SCHEDULED","COMPLETED"].includes(lesson.status);
  const byId=new Map<string,KidsStudent>();
  let incomplete=false;
  if(lesson.kind!=="REPLACEMENT"){
    if(!group)return unavailable("Turma não encontrada. Confira na chamada.");
    for(const student of group.students){
      const started=!student.startDate||student.startDate<=lesson.date;
      if(!started||(!student.active&&!Object.hasOwn(attendance,student.id)))continue;
      if(byId.has(student.id)&&byId.get(student.id)!.name!==student.name){incomplete=true;continue;}
      byId.set(student.id,student);
    }
  }
  for(const id of new Set(lesson.replacementStudentIds||[])){
    if(byId.has(id))continue;
    const profiles=data.classes.flatMap(item=>item.students).filter(student=>student.id===id);
    const names=new Set(profiles.map(student=>student.name.trim()));
    if(!profiles.length||names.size!==1){incomplete=true;continue;}
    const student=profiles.find(item=>item.active)||profiles[0];
    byId.set(id,student);
  }
  const students=[...byId.values()].filter(student=>Boolean(student.id&&student.name.trim())).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(student=>({
    id:student.id,name:student.name,inactive:!student.active,
    state:!open?"pending" as const:attendance[student.id]==="ABSENT"?"absent" as const:lesson.status==="COMPLETED"&&attendance[student.id]==="PRESENT"?"present" as const:"pending" as const,
    canOpenAttendance:open&&student.active&&group?.active!==false&&!incomplete,
  }));
  return {lessonId:lesson.id,name:lesson.replacementName||group?.name,teacher:group?.teacher?.trim()||undefined,endTime:lesson.replacementEndTime||group?.endTime,status:statuses[lesson.status],students,notice:incomplete?"Há alunos sem identificação suficiente. Confira a lista completa na chamada.":group?.active===false?"Turma inativa. Consulte a chamada para conferir o histórico.":undefined};
}
