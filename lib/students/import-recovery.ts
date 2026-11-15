import {createHash} from 'node:crypto';
import type {Student} from '@/types/models';
export const IMPORT_CONFIRMATION='RESTAURAR IMPORTAÇÃO 2026';
export function importRecoveryPreview(current:Student[],incoming:Student[]){
 if(!Array.isArray(current)||!Array.isArray(incoming)||new Set(incoming.map(s=>s.id)).size!==incoming.length)throw Error('Não foi possível conferir os cadastros.');
 const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const changes=[...current.filter(s=>!incoming.some(i=>i.id===s.id)).map(s=>({id:s.id,name:s.name,change:'REMOVIDO'})),...incoming.filter(i=>!current.some(s=>s.id===i.id)).map(s=>({id:s.id,name:s.name,change:'INCLUÍDO'})),...incoming.filter(i=>current.some(s=>s.id===i.id&&hash(s)!==hash(i))).map(s=>({id:s.id,name:s.name,change:'SUBSTITUÍDO'}))];
 const counts=(list:Student[])=>({students:list.length,sessions:list.reduce((n,s)=>n+(s.sessions?.length||0),0),workouts:list.reduce((n,s)=>n+(s.workouts?.length||0),0),assessments:list.reduce((n,s)=>n+(s.assessments?.length||0),0),inactive:list.filter(s=>s.status!=='ACTIVE').length});
 return {digest:hash({current,incoming}),source:'Importação histórica de 2026 incluída no DMP',importedAt:null,before:counts(current),after:counts(incoming),changes};
}
