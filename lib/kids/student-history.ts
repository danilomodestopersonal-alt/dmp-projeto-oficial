import type { KidsData, KidsLesson } from "../../types/kids";
import { computeKidsStudentReplacementBalance, isKidsFifthMonthlyLesson } from "./replacement-balance";

export type StudentHistoryRow = { id:string; date:string; type:string; title:string; detail:string; indicator?:"present"|"absent"|"pending"|"replaced"|"cancelled" };
export function kidsStudentHistory(data:KidsData,studentId:string,start=data.semesterStart,end=data.semesterEnd,now=new Date()) {
  const inPeriod=(date:string)=>date>=start&&date<=end;
  const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const balance=computeKidsStudentReplacementBalance(data,studentId,end<today?end:today);
  const dues=balance.events.filter(e=>e.type==="DUE").sort((a,b)=>a.date.localeCompare(b.date));
  const replaced=balance.events.filter(e=>e.type==="REPLACED").sort((a,b)=>a.date.localeCompare(b.date));
  const pending=dues.slice(Math.min(dues.length,replaced.length)).filter(e=>inPeriod(e.date));
  const rows:StudentHistoryRow[]=[];
  const metrics={present:0,absent:0,pending:pending.length,replaced:0,cancelled:0};
  const represented=new Set<string>();
  const realized=new Set<string>();
  const latest=new Map<string,KidsLesson>();
  for(const lesson of data.lessons) {
    const key=lesson.kind==="REPLACEMENT"?lesson.id:`${lesson.classId}|${lesson.date}`;
    const prior=latest.get(key);if(!prior||lesson.updatedAt>=prior.updatedAt)latest.set(key,lesson);
  }
  for(const lesson of latest.values()) {
    if(!inPeriod(lesson.date))continue;
    const group=data.classes.find(g=>g.id===lesson.classId);
    const member=group?.students.find(s=>s.id===studentId);
    const individual=(lesson.replacementStudentIds||[]).includes(studentId);
    const recorded=(data.replacementUsages||[]).find(u=>u.studentId===studentId&&u.lessonId===lesson.id);
    const explicit=Object.prototype.hasOwnProperty.call(lesson.attendance||{},studentId);
    const regular=lesson.kind!=="REPLACEMENT";
    if(regular ? !explicit&&(!member||(member.startDate&&member.startDate>lesson.date)) : !individual&&!recorded&&!explicit)continue;
    const fifth=regular&&isKidsFifthMonthlyLesson(data,lesson);
    const replacement=!regular||fifth||individual||Boolean(recorded);
    const className=lesson.replacementName||group?.name||"Aula Kids";
    const endTime=lesson.replacementEndTime||group?.endTime||"23:59";
    const held=lesson.status==="COMPLETED"||(lesson.status==="SCHEDULED"&&new Date(`${lesson.date}T${endTime}:00`).getTime()<=now.getTime());
    const absent=(recorded?.attendance||lesson.attendance?.[studentId])==="ABSENT";
    let title=held&&!member?.active&&!explicit&&!replacement?"Aula realizada · chamada não registrada":held?(absent?"Falta registrada":"Presença registrada"):"Aula agendada";
    if(lesson.status==="CANCELLED"){title="Aula cancelada";metrics.cancelled++;}
    else if(lesson.status==="HOLIDAY")title="Feriado · aula não realizada";
    else if(held&&!replacement&&(!member||member.active||explicit)){if(absent)metrics.absent++;else metrics.present++;}
    if(replacement&&held&&lesson.status!=="CANCELLED"&&lesson.status!=="HOLIDAY"){realized.add(`${lesson.id}|${lesson.date}`);title=`Reposição realizada · ${absent?"falta":"presença"}`;}
    if(replacement&&!held&&lesson.status==="SCHEDULED")title="Reposição agendada";
    if(absent&&lesson.absenceReplacementRights?.[studentId]&&!replacement)title+=" · com direito à reposição";
    const indicator=lesson.status==="CANCELLED"?"cancelled":lesson.status==="HOLIDAY"?undefined:replacement&&held?"replaced":held&&!replacement&&(!member||member.active||explicit)?absent?"absent":"present":undefined;
    rows.push({indicator,id:`lesson:${lesson.id}`,date:lesson.date,type:replacement?"Reposição":"Aula regular",title,detail:[className,fifth?"5ª aula do mês":"",lesson.objective,lesson.notes,lesson.cancelReason==="RAIN"?"Chuva":lesson.cancelReasonOther].filter(Boolean).join(" · ")});
    if(replacement)represented.add(lesson.id);
  }
  // Registros preservados e legados aparecem quando a aula não fornece o vínculo.
  for(const event of replaced.filter(e=>inPeriod(e.date)&&e.stage!=="ANTICIPATED")) {
    if(represented.has(event.lessonId))continue;
    realized.add(`${event.lessonId}|${event.date}`);
    const usage=(data.replacementUsages||[]).find(u=>u.studentId===studentId&&u.lessonId===event.lessonId);
    const legacy=(data.replacements||[]).find(r=>r.studentId===studentId&&(r.destinationLessonId||r.sourceLessonId)===event.lessonId&&r.status==="COMPLETED");
    rows.push({indicator:"replaced",id:event.id,date:event.date,type:"Reposição",title:`Reposição realizada · ${(usage?.attendance||legacy?.attendance)==="ABSENT"?"falta":usage||legacy?.attendance?"presença":"chamada não registrada"}`,detail:event.label});represented.add(event.lessonId);
  }
  for(const credit of data.replacements||[]) {
    if(credit.studentId!==studentId||credit.status!=="SCHEDULED")continue;
    const date=credit.scheduledDate||credit.sourceDate;if(!inPeriod(date)||credit.destinationLessonId&&represented.has(credit.destinationLessonId))continue;
    rows.push({id:`scheduled:${credit.id}`,date,type:"Reposição",title:"Reposição agendada",detail:credit.reason});
  }
  for(const event of pending)rows.push({indicator:"pending",id:`pending:${event.id}`,date:event.date,type:"Direito de reposição",title:"Reposição pendente",detail:event.label});
  metrics.replaced=realized.size;
  return {metrics,rows:rows.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))};
}
