import type {KidsData,KidsLesson} from '@/types/kids';
import type {CalendarEvent} from '@/types/models';
export const taughtBySubstitute=(lesson:KidsLesson)=>lesson.teacherSubstitution?.date===lesson.date;
export function personalTeachingEvents(events:CalendarEvent[],data:KidsData|null){
 const lessons=(data?.lessons||[]).filter(taughtBySubstitute);
 const ids=new Set(lessons.flatMap(l=>['dmp-kids:'+l.id,...l.teacherSubstitution!.googleEventIds]));
 return events.filter(e=>!ids.has(e.id)&&!lessons.some(l=>e.kidsLesson?.lessonId===l.id));
}
export function teachingMetadataPreserved(before:KidsData,after:KidsData){
 return before.lessons.every(l=>!l.teacherSubstitution||JSON.stringify(after.lessons.find(n=>n.id===l.id)?.teacherSubstitution)===JSON.stringify(l.teacherSubstitution))&&after.lessons.every(l=>!l.teacherSubstitution||Boolean(before.lessons.find(n=>n.id===l.id)?.teacherSubstitution));
}
