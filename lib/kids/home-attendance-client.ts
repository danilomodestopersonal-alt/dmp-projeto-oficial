import type {KidsData} from "@/types/kids";
import type {HomeAttendanceCommand} from "./home-attendance";
type Result={ok:boolean;data?:KidsData;error?:string};
const uncertain="Não foi possível confirmar. Atualize a página.";
export function createHomeAttendanceWriter(fetcher:typeof fetch){
  let queue:Promise<unknown>=Promise.resolve();
  const read=async()=>{
    const response=await fetcher("/api/kids",{cache:"no-store",credentials:"same-origin"});
    if([401,403].includes(response.status))throw new Error("Sessão expirada. Entre novamente.");
    const body=await response.json();
    if(!response.ok||body.ok!==true||body.data?.version!==1||!Array.isArray(body.data.lessons)||!body.updatedAt)throw new Error(uncertain);
    return {data:body.data as KidsData,updatedAt:String(body.updatedAt)};
  };
  const save=async(command:HomeAttendanceCommand):Promise<Result>=>{
    let fresh;
    try{fresh=await read();}catch(error){return {ok:false,error:error instanceof Error?error.message:uncertain};}
    let response:Response|undefined,body:any;
    try{
      response=await fetcher("/api/kids/home-attendance",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-DMP-Expected-Updated-At":fresh.updatedAt},body:JSON.stringify(command)});
      body=await response.json();
    }catch{}
    const matches=(data:KidsData)=>{
      const lesson=data.lessons?.find(item=>item.id===command.lessonId);
      if(!lesson)return false;
      return command.target==="ABSENT"?lesson.attendance?.[command.studentId]==="ABSENT":lesson.attendance?.[command.studentId]!=="ABSENT";
    };
    if(response?.ok&&body?.ok===true&&body.operationId===command.operationId&&body.updatedAt&&body.data?.version===1&&matches(body.data))return {ok:true,data:body.data};
    if(response&&[401,403].includes(response.status))return {ok:false,error:"Sessão expirada. Entre novamente."};
    let latest;
    try{latest=await read();}catch{}
    if(response?.status!==409&&latest&&matches(latest.data)&&latest.data.homeAttendanceAudit?.some(item=>item.operationId===command.operationId))return {ok:true,data:latest.data};
    return {ok:false,data:latest?.data,error:body?.error||uncertain};
  };
  return (command:HomeAttendanceCommand):Promise<Result>=>{const task=queue.then(()=>save(command));queue=task.catch(()=>undefined);return task;};
}
export const saveHomeAttendance=createHomeAttendanceWriter((...args)=>fetch(...args));
