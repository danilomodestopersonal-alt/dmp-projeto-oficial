import type {CalendarEvent} from "@/types/models";
import type {KidsData,KidsCategory} from "@/types/kids";
import {kidsLessonClass} from "./class-history";
import {homeKidsCard} from "./home-card";

const labels:Record<KidsCategory,string>={RED:"Vermelha",ORANGE:"Laranja",GREEN:"Verde",YELLOW:"Amarela"};
// Verified read-only on 22/10/2026 against the Calendar occurrence (including its
// recurringEventId) and kids_v1. No matching by title/time for this legacy bridge.
const legacyLinks=[{seriesId:"69i3id9hcgom2bb6coq3ib9k70s38b9o6crjab9ichj36dpg71hm2phm6c_R20260813T180000",classId:"kids-class-turma-de-quinta-15h",from:"2026-10-22"}];
const localDate=(value:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));

export function projectHomeKidsEvents(events:CalendarEvent[],data:KidsData|null,today:string){
  if(!data)return events;
  return events.map(event=>{
    if(event.allDay||event.id.startsWith("dmp-kids:"))return event;
    const date=localDate(event.originalStartTime||event.start);
    const link=legacyLinks.find(item=>item.seriesId===event.recurringEventId&&date>=item.from);
    if(!link||date<today)return event;
    const matches=data.lessons.filter(lesson=>lesson.classId===link.classId&&lesson.date===date&&lesson.kind!=="REPLACEMENT");
    if(matches.length!==1)return event;
    const lesson=matches[0],group=kidsLessonClass(data,lesson);
    if(!group)return event;
    const request={date,time:group.startTime,category:group.category,lessonId:lesson.id};
    if(!homeKidsCard(data,request).lessonId)return event;
    return {...event,summary:`Tênis Kids · Bola ${labels[group.category]}`,start:`${date}T${group.startTime}:00-03:00`,end:`${date}T${group.endTime}:00-03:00`,kidsLesson:request};
  });
}
