import {spokenNumbers} from './numbers';
export type VoiceExercise={block:string;name:string;sets:string;reps:string;load:string;evidence:string};
export type VoiceWorkout={studentName:string;objective:string;protocol:string;exercises:VoiceExercise[];warnings:string[]};
export const protocols=['','B7','Convencional','Bi-set','Tri-set','Circuito','Personalizado'];
const clean=(v:unknown,max:number)=>{if(typeof v!=="string"||v.length>max||/[\r\n\u0000-\u001f]/.test(v))throw Error("Campo de interpretação inválido");return v.trim();};
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function validateWorkout(raw:unknown,transcript:string):VoiceWorkout{
 if(!raw||typeof raw!=='object')throw Error('Interpretação inválida');const r=raw as Record<string,unknown>;
 if(!Array.isArray(r.exercises)||r.exercises.length<1||r.exercises.length>60||!Array.isArray(r.warnings)||r.warnings.length>30)throw Error('Exercícios inválidos');
 const studentName=clean(r.studentName,120),objective=clean(r.objective,200),protocol=clean(r.protocol,32);if(!protocols.includes(protocol))throw Error('Protocolo inválido');
 const warnings=r.warnings.map(v=>clean(v,300));
 const exercises=r.exercises.map((v:Record<string,unknown>)=>{
  if(!v||typeof v!=='object')throw Error('Exercício inválido');const e={block:clean(v.block,3),name:clean(v.name,160),sets:clean(v.sets,3),reps:clean(v.reps,32),load:clean(v.load,80),evidence:clean(v.evidence,1000)};
  if(!e.name||normalized(e.evidence).length<3||!/^\d{0,2}$/.test(e.block)||!/^\d{0,2}$/.test(e.sets)||! /^(?:\d+(?:[-–]\d+)?|F)?$/i.test(e.reps)||!e.evidence||!normalized(transcript).includes(normalized(e.evidence)))throw Error('Exercício sem suporte na transcrição');
  if(!normalized(e.name).split(' ').some(token=>token.length>=3&&normalized(e.evidence).split(' ').some(word=>word===token)))throw Error('Nome de exercício não sustentado pelo trecho citado');
  const supported=spokenNumbers(e.evidence);
  for(const key of ['sets','reps','load'] as const){const values=Array.from(e[key].matchAll(/\d+(?:[.,]\d+)?/g),m=>Number(m[0].replace(',','.')));if(values.some(n=>!supported.has(n))){e[key]='';warnings.push(`Revisar ${key} de ${e.name}: valor não confirmado no ditado.`);}}
  if(/\bou\b|talvez|n[aã]o tenho certeza/i.test(e.evidence)){e.sets='';e.reps='';e.load='';warnings.push(`Trecho ambíguo em ${e.name}. Preencha séries, repetições e carga após conferir.`);}
  if(e.reps.toUpperCase()==='F'){if(!/\bfalha\b|\bf\b/i.test(e.evidence)){e.reps='';warnings.push(`Falha não confirmada em ${e.name}.`);}else e.reps='F';}return e;
 });
 return {studentName:studentName&&normalized(transcript).includes(normalized(studentName))?studentName:'',objective,protocol,exercises,warnings};
}
export function formatWorkout(w:VoiceWorkout):string{
 const lines=['Objetivo: '+w.objective];if(w.protocol)lines.push('Protocolo: '+w.protocol);let block='';
 for(const e of w.exercises){if(e.block&&e.block!==block){block=e.block;lines.push('','Bloco '+block);}const prescription=e.sets&&e.reps?`${e.sets}x${e.reps}`:'';lines.push([e.name,prescription,e.load].filter(Boolean).join(' — '));}
 return lines.join('\n').trim();
}
export const voiceSchema={type:'object',additionalProperties:false,required:['studentName','objective','protocol','exercises','warnings'],properties:{studentName:{type:'string'},objective:{type:'string'},protocol:{type:'string',enum:protocols},warnings:{type:'array',items:{type:'string'}},exercises:{type:'array',items:{type:'object',additionalProperties:false,required:['block','name','sets','reps','load','evidence'],properties:Object.fromEntries(['block','name','sets','reps','load','evidence'].map(key=>[key,{type:'string'}]))}}}};
