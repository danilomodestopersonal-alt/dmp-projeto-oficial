import type {KidsData,KidsLesson} from "@/types/kids";
import {homeKidsCard} from "./home-card";
import {chamadaSaveMatches} from "./chamada-replacement";
import {recordCompletedReplacement,replacementRosterIsValid} from "./replacement-integrity";

type Request=Parameters<typeof homeKidsCard>[1];
type Selection={request:Request;lessonId:string;studentId:string};
type Snapshot={data:KidsData;updatedAt:string};
type Result={ok:boolean;data?:KidsData;error?:string};
const uncertain="Não foi possível confirmar. Atualize a página.";

export function prepareHomeKidsAbsence(data:KidsData,selection:Selection,now=new Date().toISOString()){
  const card=homeKidsCard(data,selection.request),student=card.students.find(item=>item.id===selection.studentId);
  if(card.lessonId!==selection.lessonId||!student?.canOpenAttendance)throw new Error("A chamada mudou. Confira em Kids.");
  const current=data.lessons.find(item=>item.id===selection.lessonId)!;
  // Repeating an absence never revokes a right granted through the official editor.
  if(current.attendance?.[selection.studentId]==="ABSENT")return {data,lesson:current,changed:false};
  const lesson:KidsLesson={...current,attendance:{...current.attendance,[selection.studentId]:"ABSENT"},absenceReplacementRights:{...current.absenceReplacementRights,[selection.studentId]:false},updatedAt:now};
  let next:KidsData={...data,lessons:data.lessons.map(item=>item.id===lesson.id?lesson:item),updatedAt:now};
  if(lesson.status==="COMPLETED"&&lesson.replacementStudentIds?.length){
    if(!replacementRosterIsValid(lesson))throw new Error("Confira os participantes da reposição em Kids.");
    next=recordCompletedReplacement(next,lesson);
  }
  return {data:next,lesson:next.lessons.find(item=>item.id===lesson.id)!,changed:true};
}

function confirmed(requested:KidsLesson,remote:KidsData,studentId:string){
  const lesson=remote.lessons?.find(item=>item.id===requested.id);
  if(!lesson||lesson.attendance?.[studentId]!=="ABSENT"||lesson.absenceReplacementRights?.[studentId])return false;
  // The existing API removes false entries while reconciling rights.
  const canonical=(item:KidsLesson)=>({...item,absenceReplacementRights:Object.fromEntries(Object.entries(item.absenceReplacementRights||{}).filter(([,right])=>right===true))});
  return chamadaSaveMatches(canonical(requested),canonical(lesson));
}

// One queue per page: separate Kids cards also read the latest version before saving.
export function createHomeKidsAbsenceWriter(fetcher:typeof fetch){
  let queue:Promise<unknown>=Promise.resolve();
  const read=async():Promise<Snapshot>=>{
    const response=await fetcher("/api/kids",{cache:"no-store",credentials:"same-origin"});
    if(response.status===401||response.status===403)throw new Error("Sessão expirada. Entre novamente.");
    const body=await response.json();
    if(!response.ok||body.ok!==true||body.data?.version!==1||!Array.isArray(body.data.classes)||!Array.isArray(body.data.lessons)||!body.updatedAt)throw new Error("Não foi possível carregar a chamada.");
    return {data:body.data,updatedAt:String(body.updatedAt)};
  };
  const save=async(selection:Selection):Promise<Result>=>{
    let fresh:Snapshot;
    try{fresh=await read();}catch(error){return {ok:false,error:error instanceof Error?error.message:uncertain};}
    let change:ReturnType<typeof prepareHomeKidsAbsence>;
    try{change=prepareHomeKidsAbsence(fresh.data,selection);}catch(error){return {ok:false,data:fresh.data,error:error instanceof Error?error.message:uncertain};}
    if(!change.changed)return {ok:true,data:fresh.data};
    let response:Response|undefined,body:any;
    try{
      response=await fetcher("/api/kids",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json","X-DMP-Expected-Updated-At":fresh.updatedAt},body:JSON.stringify(change.data)});
      body=await response.json();
    }catch{}
    if(response?.ok&&body?.ok===true&&body.updatedAt&&body.data&&confirmed(change.lesson,body.data,selection.studentId))return {ok:true,data:body.data};
    if(response&&(response.status===401||response.status===403))return {ok:false,error:"Sessão expirada. Entre novamente."};
    // Read back an uncertain save. Never repeat the write automatically.
    let latest:Snapshot|undefined;
    try{latest=await read();}catch{}
    if(response?.status!==409&&latest&&confirmed(change.lesson,latest.data,selection.studentId))return {ok:true,data:latest.data};
    return {ok:false,data:latest?.data,error:response?.status===409?"Dados alterados. Tente novamente.":uncertain};
  };
  return (selection:Selection):Promise<Result>=>{
    const task=queue.then(()=>save(selection));queue=task.catch(()=>undefined);return task;
  };
}
const writer=createHomeKidsAbsenceWriter((...args)=>fetch(...args));
export const saveHomeKidsAbsence=writer;
