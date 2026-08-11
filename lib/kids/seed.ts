import type { KidsCategory, KidsClass, KidsData, KidsLesson } from "@/types/kids";
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
  return {version:1,semesterStart:KIDS_SEMESTER_START,semesterEnd:KIDS_SEMESTER_END,classes,lessons,replacements:[],updatedAt:now};
}

export function normalizeKidsData(source:KidsData):KidsData{
  const now=new Date().toISOString();
  const classes=source.classes.map(group=>{
    const category=(group.category as string)==="PURPLE"?"RED":group.category;
    return {...group,category,name:kidsClassName(category,group.weekday,group.startTime),teacher:group.teacher||"Danilo Modesto",students:group.students.map(student=>({...student}))};
  });
  const classMap=new Map(classes.map(group=>[group.id,group]));
  const lessons=source.lessons.map(lesson=>{
    const group=classMap.get(lesson.classId);const plan=group?getKidsPedagogicalPlan(group.category,lesson.date):undefined;
    return {...lesson,theme:lesson.theme||plan?.theme||"",pedagogicalFocus:lesson.pedagogicalFocus||plan?.focus||"",objective:lesson.objective||plan?.objective||"",stations:lesson.stations?.length?lesson.stations:plan?.stations||[],teacherTip:lesson.teacherTip||plan?.tip||"",plannedPlan:lesson.plannedPlan|| (plan?formatKidsPlan(plan):"")};
  });
  return {...source,classes,lessons,replacements:source.replacements||[],updatedAt:source.updatedAt||now};
}
