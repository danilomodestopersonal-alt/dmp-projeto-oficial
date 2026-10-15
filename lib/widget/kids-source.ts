import { kidsLessonClass } from "@/lib/kids/class-history";
import type {CalendarEvent} from "@/types/models";
import type {KidsData} from "@/types/kids";
import {isKidsFifthMonthlyLesson} from "@/lib/kids/replacement-balance";
import {categoryLabelForHome,normalizeName} from "./home-source";
export function localKidsForHome(data:KidsData,todayKey:string):CalendarEvent[]{
const localEvents=data.lessons
          .filter(lesson=>lesson.date===todayKey&&lesson.status!=="CANCELLED"&&lesson.status!=="HOLIDAY"&&(lesson.kind==="REPLACEMENT"||isKidsFifthMonthlyLesson(data,lesson)))
          .flatMap(lesson=>{
            const group=kidsLessonClass(data,lesson);
            const category=lesson.replacementCategory||group?.category;
            const startTime=lesson.replacementStartTime||group?.startTime;
            const endTime=lesson.replacementEndTime||group?.endTime||startTime;
            if(!category||!startTime)return [];
            const categoryLabel=categoryLabelForHome(category);
            const fifthReplacement=lesson.kind!=="REPLACEMENT"&&isKidsFifthMonthlyLesson(data,lesson);
            const baseTitle=fifthReplacement?"5ª aula do mês — reposição":lesson.replacementName||"Aula de reposição";
            const title=normalizeName(baseTitle).includes(normalizeName(categoryLabel))?baseTitle:`${baseTitle} · Bola ${categoryLabel}`;
            const studentCount=fifthReplacement
              ? group?.students.filter(student=>student.active&&(!student.startDate||student.startDate<=lesson.date)).length||0
              :(lesson.replacementStudentIds||[]).length;
            return [{
              id:`dmp-kids:${lesson.id}`,
              summary:title,
              description:fifthReplacement
                ? `Já contabilizada como reposição · ${studentCount} criança${studentCount===1?"":"s"}`
                :`Aula criada no DMP · ${studentCount} criança${studentCount===1?"":"s"}`,
              start:`${lesson.date}T${startTime}:00-03:00`,
              end:`${lesson.date}T${endTime}:00-03:00`,
            } satisfies CalendarEvent];
          });
return localEvents;
}
