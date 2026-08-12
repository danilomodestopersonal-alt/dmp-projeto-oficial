import type { KidsCategory, KidsClass, KidsData, KidsEvent, KidsLesson } from "@/types/kids";
import { formatKidsPlan, getKidsPedagogicalPlan } from "@/lib/kids/pedagogy";

export const KIDS_SEMESTER_START="2026-08-03";
export const KIDS_SEMESTER_END="2026-12-19";
export const KIDS_HOLIDAYS=new Set(["2026-09-07","2026-10-12","2026-11-02","2026-11-15","2026-11-22"]);

type SeedClass={name:string;weekday:number;startTime:string;category:KidsCategory;students:string[]};
const seedClasses:SeedClass[]=[
  {name:"Turma de segunda 16h",weekday:1,startTime:"16:00",category:"RED",students:["Nina Zelenika","Camila Oyamada","Luiza Staut","Laura Staut","Rafaela Masson"]},
  {name:"Turma de segunda 17h",weekday:1,startTime:"17:00",category:"ORANGE",students:["Ricardo Gandara","Luis Felipe","Helena Zelenika","Julia Fais","Matheus Di Piero","Felipe Grespam","Gustavo Grespam"]},
  {name:"Turma de terça 16h",weekday:2,startTime:"16:00",category:"ORANGE",students:["Luiza Kimori","Gabriela Soares","João Vasconcelos"]},
  {name:"Turma de quarta 15h",weekday:3,startTime:"15:00",category:"ORANGE",students:["Livia Marques","Leandro","Ana Amelia"]},
  {name:"Turma de quarta 16h",weekday:3,startTime:"16:00",category:"RED",students:["Nina Zelenika","Camila Oyamada","Laura Staut","Rafaela Masson"]},
  {name:"Turma de quarta 17h",weekday:3,startTime:"17:00",category:"ORANGE",students:["Pedro Gracitelli","Helena Zelenika","Ricardo Gandara","Lucca Cappabianco","Julia Fais"]},
  {name:"Turma de quinta 15h",weekday:4,startTime:"15:00",category:"GREEN",students:["Henrique Felicio","Bruno Oyamada","Stela"]},
  {name:"Turma de quinta 16h",weekday:4,startTime:"16:00",category:"ORANGE",students:["Eduardo Piton","Gabriela Soares","João Vasconcelos","Lucca Cappabianco","Ricardo Gandara","Larissa Ibe"]},
  {name:"Turma de quinta 17h",weekday:4,startTime:"17:00",category:"ORANGE",students:["Eduardo Tenca","Joaquim Tonelatti","Joaquim Beltrame","Tiago Perez"]},
  {name:"Turma de sexta 16h",weekday:5,startTime:"16:00",category:"YELLOW",students:["Otavio Subi","Murilo Duarte"]},
  {name:"Turma de sábado 8h",weekday:6,startTime:"08:00",category:"RED",students:["Elisa Marques","Murilo Bitencourt","Jorge Marques","Davi Modesto","Alice"]},
  {name:"Turma de sábado 9h",weekday:6,startTime:"09:00",category:"ORANGE",students:["Pedro Gracitelli","Felipe Grespam","Gustavo Grespam","Chiara Pallone","Matheus Di Piero"]},
  {name:"Turma de sábado 10h",weekday:6,startTime:"10:00",category:"RED",students:["Beatriz Roma","Bruna Pallone","Enrico Colbano","Elisa Constanza","Theo Vargas","Caio Vargas","Matheus Leite"]},
];

const categoryName:Record<KidsCategory,string>={RED:"Vermelha",ORANGE:"Laranja",GREEN:"Verde",YELLOW:"Amarela"};
const weekdayName=["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
const kidsEvents:KidsEvent[]=[
  {id:"event-clinica-ricardo-2026",name:"Clínica Técnica com Ricardo",startDate:"2026-09-13",description:"Treinamento Técnico-Tático — Situações de Fundo de Quadra.",year:2026},
  {id:"event-tmc-adulto-2026",name:"TMC Adulto — Torneio de Duplas",startDate:"2026-09-26",endDate:"2026-09-27",description:"Torneio de duplas para atletas adultos.",year:2026},
  {id:"event-tmc-kids-2026",name:"TMC Kids",startDate:"2026-10-24",endDate:"2026-10-25",year:2026},
  {id:"event-finals-ranking-2026",name:"Finals do Ranking DS Tennis",startDate:"2026-12-05",endDate:"2026-12-06",year:2026},
  {id:"event-encerramento-kids-2026",name:"Encerramento das Aulas Kids",startDate:"2026-12-19",year:2026},
  {id:"event-solidario-etapa-1-2027",name:"Circuito Solidário de Tênis — 1ª Etapa",startDate:"2027-07-31",endDate:"2027-08-01",year:2027},
  {id:"event-solidario-etapa-2-2027",name:"Circuito Solidário de Tênis — 2ª Etapa",startDate:"2027-08-14",endDate:"2027-08-15",year:2027},
];
export function kidsClassName(category:KidsCategory,weekday:number,startTime:string){return `Bola ${categoryName[category]} — ${weekdayName[weekday]}, ${Number(startTime.slice(0,2))}h`;}

function slug(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");}
function addHour(value:string){const [h,m]=value.split(":").map(Number);return `${String((h+1)%24).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}
function datesBetween(start:string,end:string){const result:string[]=[];const cursor=new Date(`${start}T12:00:00`);const last=new Date(`${end}T12:00:00`);while(cursor<=last){result.push(cursor.toISOString().slice(0,10));cursor.setDate(cursor.getDate()+1);}return result;}

export function createKidsSeed():KidsData{
  const now=new Date().toISOString();
  const classes:KidsClass[]=seedClasses.map(item=>({
    id:`kids-class-${slug(item.name)}`,name:kidsClassName(item.category,item.weekday,item.startTime),weekday:item.weekday,startTime:item.startTime,endTime:addHour(item.startTime),category:item.category,teacher:"Danilo Modesto",active:true,updatedAt:now,
    students:item.students.map(name=>({id:`kid-${slug(name)}`,name,active:true,startDate:KIDS_SEMESTER_START})).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")),
  }));
  const lessons:KidsLesson[]=[];
  for(const date of datesBetween(KIDS_SEMESTER_START,KIDS_SEMESTER_END)){
    const weekday=new Date(`${date}T12:00:00`).getDay();
    for(const group of classes.filter(item=>item.weekday===weekday)){
      const holiday=KIDS_HOLIDAYS.has(date);
      const plan=getKidsPedagogicalPlan(group.category,date);
      lessons.push({id:`lesson-${group.id}-${date}`,classId:group.id,date,status:holiday?"HOLIDAY":"SCHEDULED",attendance:{},theme:plan?.theme||"",pedagogicalFocus:plan?.focus||"",objective:plan?.objective||"",stations:plan?.stations||[],teacherTip:plan?.tip||"",plannedPlan:plan?formatKidsPlan(plan):"",actualPlan:"",notes:holiday?"Aula cancelada por feriado.":"",replacementEligible:false,replacementStatus:"NONE",updatedAt:now});
    }
  }
  return {version:1,semesterStart:KIDS_SEMESTER_START,semesterEnd:KIDS_SEMESTER_END,classes,lessons,replacements:[],events:kidsEvents.map(item=>({...item})),updatedAt:now};
}

export function normalizeKidsData(source:KidsData):KidsData{
  const now=new Date().toISOString();
  const rawClasses=source.classes.map(group=>{
    const category=(group.category as string)==="PURPLE"?"RED":group.category;
    return {...group,category,name:kidsClassName(category,group.weekday,group.startTime),teacher:group.teacher||"Danilo Modesto",students:group.students.map(student=>({...student}))};
  });
  const aliases=new Map<string,string>();
  const profiles=new Map<string,KidsClass["students"][number]>();
  for(const group of rawClasses)for(const student of group.students){
    const key=slug(student.name);const id=`kid-${key}`;aliases.set(student.id,id);
    const current=profiles.get(id);
    profiles.set(id,current?mergeKidsStudent(current,student,id):{...student,id,name:student.name.trim()});
  }
  const classes=rawClasses.map(group=>{
    const students=new Map<string,KidsClass["students"][number]>();
    for(const membership of group.students){
      const id=aliases.get(membership.id)||membership.id;const profile=profiles.get(id)||membership;const current=students.get(id);
      const next={...profile,id,active:membership.active,startDate:membership.startDate||profile.startDate};
      students.set(id,current?{...mergeKidsStudent(current,next,id),active:current.active||next.active,startDate:earliestDate(current.startDate,next.startDate)}:next);
    }
    return {...group,students:[...students.values()].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"))};
  });
  const classMap=new Map(classes.map(group=>[group.id,group]));
  const sourceLessons=new Map(source.lessons.map(lesson=>[lesson.id,lesson]));
  const canonicalLessons=createKidsSeed().lessons.filter(lesson=>classMap.has(lesson.classId));
  const mergedLessons=[...source.lessons,...canonicalLessons.filter(lesson=>!sourceLessons.has(lesson.id))];
  const lessons=mergedLessons.map(lesson=>{
    const group=classMap.get(lesson.classId);const plan=group?getKidsPedagogicalPlan(group.category,lesson.date):undefined;
    const endTime=lesson.replacementEndTime||group?.endTime||group?.startTime||"23:59";
    const passed=lesson.status==="SCHEDULED"&&new Date(`${lesson.date}T${endTime}:00-03:00`).getTime()<=Date.now();
    const attendance:KidsLesson["attendance"]={};
    for(const [studentId,status] of Object.entries(lesson.attendance||{})){
      const id=aliases.get(studentId)||studentId;
      attendance[id]=attendance[id]==="ABSENT"||status==="ABSENT"?"ABSENT":"PRESENT";
    }
    if(passed&&group)for(const student of group.students)if(student.active&&(!student.startDate||student.startDate<=lesson.date)&&attendance[student.id]!=="ABSENT")attendance[student.id]="PRESENT";
    return {...lesson,kind:lesson.kind||"REGULAR",replacementStudentIds:(lesson.replacementStudentIds||[]).map(id=>aliases.get(id)||id),status:passed?"COMPLETED":lesson.status,attendance,theme:lesson.theme||plan?.theme||"",pedagogicalFocus:lesson.pedagogicalFocus||plan?.focus||"",objective:lesson.objective||plan?.objective||"",stations:lesson.stations?.length?lesson.stations:plan?.stations||[],teacherTip:lesson.teacherTip||plan?.tip||"",plannedPlan:lesson.plannedPlan|| (plan?formatKidsPlan(plan):"")};
  });
  const lessonMap=new Map(lessons.map(lesson=>[lesson.id,lesson]));
  const replacements=[...(source.replacements||[])].map(item=>{
    const studentId=aliases.get(item.studentId)||item.studentId;
    const destination=item.destinationLessonId?lessonMap.get(item.destinationLessonId):undefined;
    if(item.status==="SCHEDULED"&&destination?.status==="COMPLETED")return {...item,studentId,status:"COMPLETED" as const,completedDate:destination.date,attendance:destination.attendance[studentId]||"PRESENT"};
    return {...item,studentId};
  });
  for(const lesson of lessons){
    if(lesson.status!=="CANCELLED"||!lesson.replacementEligible)continue;
    const group=classMap.get(lesson.classId);
    if(!group)continue;
    for(const student of group.students){
      if(!student.active||(student.startDate&&student.startDate>lesson.date))continue;
      if(replacements.some(item=>item.sourceLessonId===lesson.id&&item.studentId===student.id))continue;
      replacements.push({
        id:`replacement-${lesson.id}-${student.id}`,
        studentId:student.id,
        classId:lesson.classId,
        sourceLessonId:lesson.id,
        sourceDate:lesson.date,
        reason:lesson.notes||"Aula cancelada com direito à reposição",
        status:"PENDING",
      });
    }
  }
  const uniqueReplacements=[...new Map(replacements.map(item=>[`${item.sourceLessonId}:${item.studentId}`,item])).values()];
  const savedEvents=Array.isArray(source.events)?source.events:[];
  const events=[...savedEvents,...kidsEvents.filter(item=>!savedEvents.some(saved=>saved.id===item.id))].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  return {...source,classes,lessons,replacements:uniqueReplacements,events,updatedAt:source.updatedAt||now};
}

function earliestDate(a?:string,b?:string){if(!a)return b;if(!b)return a;return a<b?a:b;}
function mergeKidsStudent(a:KidsClass["students"][number],b:KidsClass["students"][number],id:string):KidsClass["students"][number]{
  return {...a,...b,id,name:(a.name||b.name).trim(),active:a.active||b.active,startDate:earliestDate(a.startDate,b.startDate),birthDate:a.birthDate||b.birthDate,fatherName:a.fatherName||b.fatherName,fatherPhone:a.fatherPhone||b.fatherPhone,motherName:a.motherName||b.motherName,motherPhone:a.motherPhone||b.motherPhone,primaryContact:a.primaryContact||b.primaryContact,notes:a.notes||b.notes,monthlyAmount:a.monthlyAmount??b.monthlyAmount,dueDay:a.dueDay??b.dueDay,billingMode:a.billingMode||b.billingMode,installmentCount:a.installmentCount??b.installmentCount};
}
