import type {CalendarEvent,Student,Session} from "@/types/models";
import {kidsCalendarRequest,getCalendarEventStudents} from "./home-source";
export function officialCounts(events:CalendarEvent[],students:Student[],sessions:{student:Student;session:Session}[]){
  const timed=events
    .filter(event=>!event.allDay)
    .sort((a,b)=>a.start.localeCompare(b.start));

  const programmedStudents=new Map<string,Student>();

  timed
    .filter(event=>!kidsCalendarRequest(event))
    .forEach(event=>{
      getCalendarEventStudents(event,students)
        .forEach(student=>programmedStudents.set(student.id,student));
    });

  sessions.forEach(item=>programmedStudents.set(item.student.id,item.student));

  const attendedIds=new Set(
    sessions
      .filter(item=>item.session.source!=="ABSENCE"&&programmedStudents.has(item.student.id))
      .map(item=>item.student.id)
  );

  const absentIds=new Set(
    sessions
      .filter(item=>item.session.source==="ABSENCE"&&programmedStudents.has(item.student.id))
      .map(item=>item.student.id)
  );

  const attended=[...programmedStudents.values()].filter(student=>attendedIds.has(student.id));
  const absent=[...programmedStudents.values()].filter(student=>absentIds.has(student.id));
  const remaining=[...programmedStudents.values()].filter(student=>!attendedIds.has(student.id)&&!absentIds.has(student.id));

  const programmed=programmedStudents.size;
  const progress=programmed?Math.round(((attended.length+absent.length)/programmed)*100):0;


return {programmed,attended:attended.length,absent:absent.length,remaining:remaining.length};
}

export function officialPeople(events:CalendarEvent[],students:Student[],sessions:{student:Student;session:Session}[]){
  const timed=events
    .filter(event=>!event.allDay)
    .sort((a,b)=>a.start.localeCompare(b.start));

  const programmedStudents=new Map<string,Student>();

  timed
    .filter(event=>!kidsCalendarRequest(event))
    .forEach(event=>{
      getCalendarEventStudents(event,students)
        .forEach(student=>programmedStudents.set(student.id,student));
    });

  sessions.forEach(item=>programmedStudents.set(item.student.id,item.student));

  const attendedIds=new Set(
    sessions
      .filter(item=>item.session.source!=="ABSENCE"&&programmedStudents.has(item.student.id))
      .map(item=>item.student.id)
  );

  const absentIds=new Set(
    sessions
      .filter(item=>item.session.source==="ABSENCE"&&programmedStudents.has(item.student.id))
      .map(item=>item.student.id)
  );

  const attended=[...programmedStudents.values()].filter(student=>attendedIds.has(student.id));
  const absent=[...programmedStudents.values()].filter(student=>absentIds.has(student.id));
  const remaining=[...programmedStudents.values()].filter(student=>!attendedIds.has(student.id)&&!absentIds.has(student.id));

return {programmed:[...programmedStudents.values()],attended,absent,remaining};
}
