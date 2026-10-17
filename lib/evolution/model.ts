import type {Student} from '@/types/models';
export type ReportSession={id:string;date:string;event:string;source:string;exercises:{name:string;sets:string;reps:string;load:string}[]};
export const healthFields={weight:['Peso','kg'],bodyFatPercent:['Gordura corporal','%'],leanMass:['Massa magra','kg'],muscleMass:['Massa muscular','kg'],waterPercent:['Água corporal','%']} as const;
export type HealthKey=keyof typeof healthFields;
export type ReportStudent={id:string;name:string;sessions:ReportSession[];assessments:{date:string;values:Partial<Record<HealthKey,number>>}[]};
export function permittedStudent(s:Student,health=false):ReportStudent {
 return {id:s.id,name:s.name,sessions:(s.sessions||[]).map(x=>({id:x.id||'',date:x.date||'',event:x.calendarEvent?.id||'',source:x.source||'UNKNOWN',exercises:(x.completedExercises||[]).map(e=>({name:e.name||'',sets:e.sets||'',reps:e.reps||'',load:e.load||''}))})),assessments:health?(s.assessments||[]).map(a=>({date:a.date,values:Object.fromEntries(Object.keys(healthFields).flatMap(k=>{const v=a[k as HealthKey];return typeof v==='number'&&Number.isFinite(v)?[[k,v]]:[]}))})):[]};
}
export function validDate(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
export function civilToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function shiftDate(s:string,n:number){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function displayDate(s:string){return validDate(s)?s.split('-').reverse().join('/'):'Data inválida';}
export function summarize(s:ReportStudent,from:string,to:string,today=civilToday()){
 if(!validDate(from)||!validDate(to)||from>to)throw Error('Selecione um período válido.');
 const groups=new Map<string,ReportSession[]>();let invalid=0,future=0,duplicateIds=0;const ids=new Map<string,string>();let idConflicts=0;
 for(const [i,x] of s.sessions.entries()){
  if(!validDate(x.date)){invalid++;continue;}if(x.date<from||x.date>to)continue;if(x.date>today){future++;continue;}
  const serialized=JSON.stringify(x);if(x.id&&ids.has(x.id)){duplicateIds++;if(ids.get(x.id)===serialized)continue;idConflicts++;}else if(x.id)ids.set(x.id,serialized);
  const key=x.event?JSON.stringify([x.event,x.date]):`single:${i}`;
  groups.set(key,[...(groups.get(key)||[]),x]);
 }
 let present=0,absent=0,unknown=0,conflicts=idConflicts,simple=0,detailed=0;const days:Record<string,number>={};
 const rows:{date:string;status:string;exercises:ReportSession['exercises']}[]=[];
 for(const list of groups.values()){
  const p=list.some(x=>['ATTENDANCE','PLANNED','FREE'].includes(x.source)),a=list.some(x=>x.source==='ABSENCE');
  const exercises=list.flatMap(x=>x.exercises.filter(e=>e.name.trim()));
  let status='Origem não classificada';
  if(p&&a){conflicts++;status='Conflito: presença e falta';}else if(p){present++;status='Presença';days[list[0].date]=(days[list[0].date]||0)+1;if(exercises.length)detailed++;else simple++;}else if(a){absent++;status='Falta';}else unknown++;
  rows.push({date:list[0].date,status,exercises});
 }
 rows.sort((a,b)=>a.date.localeCompare(b.date));
 const denominator=present+absent;
 return {present,absent,unknown,conflicts,simple,detailed,denominator,frequency:conflicts||!denominator?null:100*present/denominator,invalid,future,duplicateIds,total:groups.size,rows,days,partial:to>=today,assessments:s.assessments.filter(a=>validDate(a.date)&&a.date>=from&&a.date<=to&&a.date<=today).sort((a,b)=>a.date.localeCompare(b.date))};
}
export type Summary=ReturnType<typeof summarize>;
export function priorComparison(s:ReportStudent,from:string,to:string,today=civilToday()){
 const n=Math.round((+new Date(to+'T12:00:00Z')-+new Date(from+'T12:00:00Z'))/86400000)+1;
 const priorTo=shiftDate(from,-1),priorFrom=shiftDate(from,-n);const current=summarize(s,from,to,today),prior=summarize(s,priorFrom,priorTo,today);
 const eligible=to<today&&current.denominator>0&&prior.denominator>0&&[current,prior].every(v=>!v.conflicts&&!v.unknown&&!v.invalid&&!v.future);
 return {eligible,priorFrom,priorTo,current,prior,reason:eligible?'Comparação dos registros classificados; não comprova cobertura integral do calendário histórico.':'Comparação omitida: período parcial, ausência de registros ou cobertura não compatível.'};
}
export function numericLoad(value:string){const m=value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|lb)?$/i);return m?{value:Number(m[1].replace(',','.')),unit:(m[2]||'').toLowerCase()}:null;}
export type ReportOptions={attendance:boolean;constancy:boolean;workouts:boolean;comparison:boolean;health:boolean;healthConfirmed:boolean;healthEquivalent:boolean;message:string;loadComparison?:{exercise:string;before:string;after:string;unit:string;confirmed:boolean}};
export function whatsapp(s:ReportStudent,r:Summary,from:string,to:string,o:ReportOptions){return `${s.name}, segue seu acompanhamento de ${displayDate(from)} a ${displayDate(to)}.\n\n${o.attendance?`${r.present} presenças e ${r.absent} faltas confirmadas.\n${r.frequency===null?'Frequência: sem cálculo disponível.':`Frequência nos registros classificados: ${r.frequency.toFixed(1).replace('.',',')}% (${r.present}/${r.denominator}).`}\n`:''}${o.workouts?`${r.detailed} ocorrências com exercícios registrados.\n`:''}${r.conflicts?'Há registros conflitantes pendentes de revisão.\n':''}${r.unknown?`${r.unknown} ocorrências de origem não classificada, fora do percentual.\n`:''}\n${o.message}`.trim();}
