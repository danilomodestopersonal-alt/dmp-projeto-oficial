import type {RoutineData,RoutineItem,RoutineActivation,RoutineVersion,RoutineDifference,RoutineMark,RoutineDraft} from '@/types/routine';
export class RoutineError extends Error{constructor(message:string,public status=409){super(message);}}
export const emptyRoutine=():RoutineData=>({schema:1,revision:0,files:[],drafts:[],versions:[],marks:[],days:[],operations:[]});
export const routineDay=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function routineDate(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function activeRoutine(data:RoutineData,date=routineDay()):RoutineVersion|undefined{return [...data.versions].filter(v=>v.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.number-a.number)[0];}
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g,'');
export function routineItems(input:unknown):RoutineItem[]{
 if(!Array.isArray(input)||input.length>100)throw new RoutineError('Use até 100 itens por versão.',400);
 const ids=new Set<string>(),names=new Set<string>();
 return input.map((i:any)=>{
  if(!i||typeof i.id!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(i.id)||ids.has(i.id)||!['SUPPLEMENT','FOOD'].includes(i.category))throw new RoutineError('Identificação de item inválida ou repetida.',400);ids.add(i.id);
  for(const k of ['name','quantity','unit','timing','clock','condition','instructions','notes'])if(typeof i[k]!=='string'||i[k].length>(['instructions','notes'].includes(k)?4000:400))throw new RoutineError('Confira os campos do item.',400);
  if(!i.name.trim())throw new RoutineError('Informe o nome de cada item.',400);
  if(i.clock&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(i.clock))throw new RoutineError('Horário inválido.',400);
  if(!['DAILY','WEEKDAYS','REVIEW'].includes(i.frequency)||!Array.isArray(i.days)||i.days.some((d:any)=>!Number.isInteger(d)||d<0||d>6)||i.days.length>7||i.frequency==='WEEKDAYS'&&!i.days.length)throw new RoutineError('Confira os dias da semana.',400);
  const key=i.category+'|'+norm(i.name)+'|'+norm(i.timing)+'|'+i.clock+'|'+[...i.days].sort().join(',')+'|'+norm(i.condition);
  if(names.has(key))throw new RoutineError('Há itens com o mesmo nome, horário e condição. Confira a duplicidade antes de aprovar.');names.add(key);
  const evidence:RoutineItem['evidence']={};
  for(const key of ['name','quantity','unit','timing','days','condition','instructions','notes'] as const){const e=i.evidence?.[key];if(e&&typeof e.excerpt==='string'&&e.excerpt.length<=8000&&['TEXT','OCR_REVIEW','MANUAL','UNRESOLVED'].includes(e.confidence))evidence[key]={excerpt:e.excerpt,confidence:e.confidence,...(Number.isInteger(e.page)&&e.page>0?{page:e.page}:{}),...(e.edited?{edited:true}:{})};}
  return {id:i.id,...(typeof i.sourceFileId==='string'&&/^[a-f0-9]{64}$/.test(i.sourceFileId)?{sourceFileId:i.sourceFileId}:{}),category:i.category,name:i.name.trim(),quantity:i.quantity,unit:i.unit,timing:i.timing,clock:i.clock,frequency:i.frequency,days:[...new Set(i.days)] as number[],condition:i.condition,instructions:i.instructions,notes:i.notes,conditional:Boolean(i.conditional),cyclingOnly:Boolean(i.cyclingOnly),reviewed:i.reviewed===true,evidence};
 });
}
const fields=['name','category','quantity','unit','timing','clock','frequency','days','condition','conditional','cyclingOnly','instructions','notes'] as const;
export function routineDifferences(before:RoutineItem[],after:RoutineItem[]):RoutineDifference[]{
 const out:RoutineDifference[]=[];
 for(const item of after){const old=before.find(x=>x.id===item.id);if(!old){out.push({id:item.id,name:item.name,change:'ADDED',fields:[]});continue;}
  const changes=fields.filter(f=>JSON.stringify(old[f])!==JSON.stringify(item[f])).map(f=>({field:f,before:Array.isArray(old[f])?old[f].join(', '):String(old[f]),after:Array.isArray(item[f])?item[f].join(', '):String(item[f])}));
  if(changes.length)out.push({id:item.id,name:item.name,change:'CHANGED',fields:changes});
 }
 for(const item of before)if(!after.some(x=>x.id===item.id))out.push({id:item.id,name:item.name,change:'REMOVED',fields:[]});return out;
}
export function planRoutineActivation(data:RoutineData,input:RoutineActivation,today=routineDay()){
 const draft=data.drafts.find(d=>d.id===input.draftId);if(!draft)throw new RoutineError('Rascunho indisponível. Reabra Minha Rotina.');
 if(typeof input.title!=='string'||!input.title.trim()||input.title.length>200||!routineDate(input.effectiveFrom)||input.effectiveFrom<today)throw new RoutineError('Informe título e vigência a partir de hoje. O histórico anterior será preservado.',400);
 if(!['REPLACE_CATEGORIES','MERGE_SELECTED','REPLACE_ALL'].includes(input.mode)||!Array.isArray(input.categories)||!input.categories.length||input.categories.some(c=>!['SUPPLEMENT','FOOD'].includes(c)))throw new RoutineError('Escolha quais partes serão atualizadas.',400);
 if(input.mode==='REPLACE_ALL'&&(!input.categories.includes('FOOD')||!input.categories.includes('SUPPLEMENT')))throw new RoutineError('Substituir o plano inteiro exige selecionar alimentação e suplementação.');
 if(input.acknowledgedWarnings!==true)throw new RoutineError('Confira as ressalvas do documento antes de aprovar.');
 const future=data.versions.filter(v=>v.effectiveFrom>input.effectiveFrom);
 if(future.length)throw new RoutineError('Existe uma versão futura para '+future.at(-1)!.effectiveFrom+'. Atualize essa versão ou escolha uma vigência igual ou posterior; nenhuma programação foi sobrescrita.');
 const selected=routineItems(input.items).filter(i=>input.categories.includes(i.category));
 if(selected.some(i=>!i.reviewed||i.frequency==='REVIEW'))throw new RoutineError('Confira cada item e defina sua frequência antes de aprovar.');
 const previous=activeRoutine(data,input.effectiveFrom),before=previous?.items||[];
 const next=input.mode==='REPLACE_ALL'?selected:input.mode==='REPLACE_CATEGORIES'?[...before.filter(i=>!input.categories.includes(i.category)),...selected]:[...before.filter(i=>!selected.some(n=>n.id===i.id)),...selected];
 // Also validate collisions against retained categories/items, not just the draft.
 const items=routineItems(next),changes=routineDifferences(before,items);
 const sourceIds=new Set(items.map(i=>i.sourceFileId).filter(Boolean));
 if([...sourceIds].some(id=>!data.files.some(f=>f.id===id)))throw new RoutineError('Documento de origem indisponível. Confira os itens.');
 const sourceWarnings=[...new Set([...draft.warnings,...data.files.filter(f=>sourceIds.has(f.id)).flatMap(f=>f.warnings),...(before.some(i=>items.some(n=>n.id===i.id))?previous?.warnings||[]:[])])];
 if(JSON.stringify(previous?.warnings||[])!==JSON.stringify(sourceWarnings)&&previous)changes.push({id:'plan-warnings',name:'Ressalvas do plano',change:'CHANGED',fields:[{field:'notes',before:previous.warnings.join('\n'),after:sourceWarnings.join('\n')}]});
 const warnings=[...sourceWarnings];
 if(data.marks.some(m=>m.date===input.effectiveFrom&&m.status!=='PENDING'))warnings.push('Já existem marcações nesta data. Elas serão preservadas com a versão original; confira antes de repetir qualquer item.');
 return {draft,items,changes,warnings,sourceWarnings,previousVersionId:previous?.id||'',effectiveFrom:input.effectiveFrom};
}
export function applyRoutineActivation(data:RoutineData,input:RoutineActivation,operationId:string,now=new Date()):RoutineData{
 const p=planRoutineActivation(data,input,routineDay(now));
 const version:RoutineVersion={id:operationId,number:Math.max(0,...data.versions.map(v=>v.number))+1,title:input.title.trim(),sourceDate:p.draft.sourceDate,sourceVersion:p.draft.sourceVersion,effectiveFrom:input.effectiveFrom,createdAt:now.toISOString(),fileId:p.draft.fileId,items:p.items,warnings:p.sourceWarnings,mode:input.mode,categories:input.categories,draftId:p.draft.id,operationId};
 return {...data,versions:[...data.versions,version]};
}
export function routineToday(data:RoutineData,date=routineDay()){
 const version=activeRoutine(data,date),week=new Date(date+'T12:00:00Z').getUTCDay(),cycling=data.days.find(d=>d.date===date)?.cycling===true;
 const items=(version?.items||[]).filter(i=>(i.frequency==='DAILY'||i.frequency==='WEEKDAYS'&&i.days.includes(week))&&(!i.cyclingOnly||cycling));
 const rows=items.map(item=>({item,versionId:version!.id,optional:item.conditional,mark:data.marks.find(m=>m.date===date&&m.itemId===item.id&&m.versionId===version!.id),earlier:data.marks.filter(m=>m.date===date&&m.itemId===item.id&&m.versionId!==version!.id&&m.status!=='PENDING')}));
 return {date,version,cycling,rows,history:data.marks.filter(m=>m.date===date&&m.versionId!==version?.id&&m.status!=='PENDING')};
}
export function markRoutine(data:RoutineData,input:any,now=new Date()):RoutineData{
 if(input.date!==routineDay(now)||!['DONE','SKIPPED','PENDING'].includes(input.status))throw new RoutineError('As marcações rápidas são para o dia atual de São Paulo.',400);
 const today=routineToday(data,input.date),row=today.rows.find(r=>r.item.id===input.itemId&&r.versionId===input.versionId);if(!row)throw new RoutineError('A versão do plano mudou. Atualize a rotina antes de marcar.');
 const mark:RoutineMark={date:input.date,itemId:row.item.id,versionId:row.versionId,status:input.status,recordedAt:now.toISOString(),itemSnapshot:row.item};
 return {...data,marks:[...data.marks.filter(m=>!(m.date===mark.date&&m.itemId===mark.itemId&&m.versionId===mark.versionId)),mark]};
}
export function saveRoutineDraft(data:RoutineData,input:any,now=new Date()):RoutineData{
 if(typeof input.id!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(input.id)||typeof input.title!=='string'||input.title.length>200)throw new RoutineError('Rascunho inválido.',400);
 const old=data.drafts.find(d=>d.id===input.id);
 if(input.fileId&&!data.files.some(f=>f.id===input.fileId))throw new RoutineError('Arquivo de origem não encontrado.');
 const baseVersion=data.versions.find(v=>v.id===input.baseVersionId),file=data.files.find(f=>f.id===(old?.fileId||input.fileId)),items=routineItems(input.items);
 const warnings=[...new Set([...(old?.warnings||[]),...(file?.warnings||[]),...(baseVersion?.warnings||[])])];
 const draft:RoutineDraft={id:input.id,title:input.title||'Plano em conferência',fileId:old?.fileId||file?.id,sourceDate:old?.sourceDate||baseVersion?.sourceDate||'',sourceVersion:old?.sourceVersion||baseVersion?.sourceVersion||'',items,warnings,createdAt:old?.createdAt||now.toISOString(),updatedAt:now.toISOString(),baseVersionId:old?.baseVersionId||baseVersion?.id};
 return {...data,drafts:[...data.drafts.filter(d=>d.id!==draft.id),draft]};
}
