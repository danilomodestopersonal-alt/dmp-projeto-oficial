import {NextRequest,NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {isAuthorized} from "@/lib/auth";
import {getGoogleAccessToken,googleConfigured,setGoogleCookies} from "@/lib/google-calendar";
import {pool} from "@/lib/db";
import {calendarRoster,rosterSummary,ROSTER_KEY,RULE_PREFIX,type RosterEdit} from "@/lib/calendar/roster";
import {matchCalendarEvents,kidsCalendarRequest} from "@/lib/widget/home-source";
import type {Student} from "@/types/models";
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({message:"Sessão inválida."},{status:401});
 if(!googleConfigured())return NextResponse.json({message:"Google não configurado."},{status:503});
 let status=502;
 try{
 const p=await request.json();const valid=(a:unknown):a is string[]=>Array.isArray(a)&&a.length<=80&&a.every(v=>typeof v==="string"&&v.length>0&&v.length<=256)&&new Set(a).size===a.length;
 if(typeof p.id!=="string"||p.id.length>1024||!p.id||typeof p.etag!=="string"||!p.etag||typeof p.operationId!=="string"||! /^[a-zA-Z0-9-]{8,80}$/.test(p.operationId)||!valid(p.ids)||!valid(p.expected)||!["single","following"].includes(p.scope))return NextResponse.json({message:"Pedido inválido."},{status:400});
 if(p.ids.length===0)return NextResponse.json({message:"Para retirar o último aluno, confira e confirme o cancelamento da ocorrência na versão atual da Agenda."},{status:409});
 const {accessToken,refreshed}=await getGoogleAccessToken(request);if(!accessToken)return NextResponse.json({message:"Reconecte o Google."},{status:401});
 const url=(id:string)=>"https://www.googleapis.com/calendar/v3/calendars/primary/events/"+encodeURIComponent(id);
 const read=async(id:string)=>{const r=await fetch(url(id),{headers:{authorization:"Bearer "+accessToken},cache:"no-store",signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error("Não foi possível conferir a agenda Google.");const e=await r.json();if(e.id!==id)throw Error("Evento divergente.");return e;};
 const event=await read(p.id);if(event.status==="cancelled"||event.start?.date||!event.start?.dateTime)return NextResponse.json({message:"Aula indisponível."},{status:400});
 const parent=event.recurringEventId?await read(event.recurringEventId):null;const target=p.scope==="following"&&parent?parent:event;
 if(p.scope==="following"&&!parent)return NextResponse.json({message:"Esta aula não é recorrente."},{status:400});
 const key=p.scope==="following"&&parent?RULE_PREFIX+createHash("sha256").update(p.operationId).digest("hex").slice(0,24):ROSTER_KEY;
 const metadata={...target.extendedProperties?.private};const saved=metadata[key]?JSON.parse(metadata[key]):null;
 const finish=()=>{const r=NextResponse.json({confirmed:true});if(refreshed)setGoogleCookies(r,refreshed);return r;};
 if(saved?.op===p.operationId){if(saved.eventId!==p.id||saved.scope!==p.scope||JSON.stringify(saved.ids)!==JSON.stringify(p.ids))return NextResponse.json({message:"Operação divergente."},{status:409});return finish();}
 const result=await pool.query("SELECT payload FROM dmp_data WHERE id = $1",["students"]);const raw=result.rows[0]?.payload;const students:Student[]=typeof raw==="string"?JSON.parse(raw):(raw||[]);
 const mapped={id:event.id,summary:event.summary||"",start:event.start.dateTime,end:event.end?.dateTime||"",originalStartTime:event.originalStartTime?.dateTime||event.start.dateTime,calendarRoster:calendarRoster(event.extendedProperties?.private,parent?.extendedProperties?.private)};
 if(kidsCalendarRequest(mapped))return NextResponse.json({message:"Use a chamada Kids para esta aula."},{status:400});
 const current=matchCalendarEvents([mapped],students)[0].matchedStudentIds||[];const equal=(a:string[],b:string[])=>[...a].sort().join("\0")===[...b].sort().join("\0");
 if(event.etag!==p.etag||!equal(current,p.expected))return NextResponse.json({message:"A aula mudou. Reabra a agenda antes de salvar."},{status:409});
 if(p.ids.some((id:string)=>!students.some(s=>s.id===id&&(current.includes(id)||s.status==="ACTIVE"))))return NextResponse.json({message:"Aluno inválido ou inativo."},{status:400});
 const from=mapped.originalStartTime;const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
 if(p.scope==="following"&&from.slice(0,10)<today)return NextResponse.json({message:"Esta e próximas exige uma aula de hoje ou futura."},{status:400});
 const r=mapped.calendarRoster;const edit:RosterEdit={op:p.operationId,at:Math.max(Date.now(),...r.rules.map(e=>e.at+1),(r.single?.at||0)+1),from,scope:p.scope,eventId:p.id,ids:p.ids,add:p.ids.filter((id:string)=>!current.includes(id)),remove:current.filter(id=>!p.ids.includes(id))};metadata[key]=JSON.stringify(edit);
 if(new TextEncoder().encode(metadata[key]).length>1024||Object.keys(metadata).length>280||new TextEncoder().encode(JSON.stringify(metadata)).length>30000)return NextResponse.json({message:"Limite seguro da agenda atingido. Nada alterado."},{status:400});
 const body:any={extendedProperties:{private:metadata}};if(target===event)body.summary=rosterSummary(event.summary||"",current,p.ids,students);
 try{const write=await fetch(url(target.id),{method:"PATCH",headers:{authorization:"Bearer "+accessToken,"Content-Type":"application/json","If-Match":target.etag},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(write.status===412){status=409;throw Error("A agenda mudou durante a gravação. Reabra a aula.");}if(!write.ok)throw Error("O Google recusou a alteração.");}catch(e){if(status===409)throw e;const check=await read(target.id);if(check.extendedProperties?.private?.[key]!==metadata[key])throw e;}
 const check=await read(target.id);if(check.extendedProperties?.private?.[key]!==metadata[key]){status=503;throw Error("Gravação não confirmada. Tente novamente sem mudar a seleção.");}return finish();
 }catch(e){return NextResponse.json({message:e instanceof Error?e.message:"Falha na agenda. Reabra antes de tentar novamente."},{status});}
}
