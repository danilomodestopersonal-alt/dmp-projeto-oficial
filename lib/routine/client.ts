// Same-origin transport shared by the routine screens. No session/token handling here.
export class RoutineRequestError extends Error {
 constructor(message:string,public status=0,public phase='load'){super(message);this.name='RoutineRequestError';}
}
const phaseLabel:Record<string,string>={load:'Carregar rotina',import:'Importar documento',save:'Salvar rotina'};
export async function routineRequest(path:string,init:RequestInit={},phase='load',timeoutMs=phase==='import'?180000:20000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  let response:Response;
  try{response=await fetch(path,{...init,credentials:'same-origin',cache:'no-store',signal:controller.signal});}
  catch{throw new RoutineRequestError(`${phaseLabel[phase]}: ${controller.signal.aborted?'o servidor demorou para responder.':'não foi possível conectar ao DMP.'} ${phase==='load'?'Confira a conexão e tente Atualizar.':'O resultado ainda não foi confirmado. Confira a rotina antes de repetir.'}`,0,phase);}
  let payload:any;try{payload=await response.json();}catch{
   throw new RoutineRequestError(`${phaseLabel[phase]}: resposta indisponível ou incompleta (HTTP ${response.status}). Tente novamente.`,response.status,phase);
  }
  if(!response.ok){
   const messages:Record<number,string>={401:'Sua sessão expirou. Entre novamente no DMP.',403:'O DMP não autorizou esta operação. Reabra a página e tente novamente.',404:'Esta função não foi encontrada. Atualize a página do DMP.',413:'O arquivo excede o limite de 5 MB.',500:'O servidor não conseguiu concluir a operação.',502:'O servidor está temporariamente indisponível.',503:'O servidor está temporariamente indisponível.',504:'O servidor demorou para responder.'};
   throw new RoutineRequestError(`${phaseLabel[phase]}: ${messages[response.status]||payload?.message||'Não foi possível concluir.'} (HTTP ${response.status})`,response.status,phase);
  }
  return payload;
 }finally{clearTimeout(timer);}
}
export function validRoutineResponse(value:any){
 return value?.data?.schema===1&&Number.isInteger(value.data.revision)&&['files','drafts','versions','marks','days','operations'].every(k=>Array.isArray(value.data[k]))&&/^\d{4}-\d{2}-\d{2}$/.test(value.today||'');
}
