'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {emptyRoutine,routineDay} from '@/lib/routine/model';
import {routineRequest,RoutineRequestError,validRoutineResponse} from '@/lib/routine/client';
import type {RoutineData} from '@/types/routine';
type RequestBody={action:string;input:unknown;operationId:string;revision:number;previewDigest?:string};
const pendingKey='dmp.routine.pending.v1';
export function useRoutine(todayOnly=false){
 const [data,setData]=useState<RoutineData>(emptyRoutine),[today,setToday]=useState(routineDay),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState<RequestBody|null>(null);
 const flight=useRef(false),latest=useRef(data),sequence=useRef(0);latest.current=data;
 const accept=(next:RoutineData)=>{sequence.current++;latest.current=next;setData(next);};
 const refresh=useCallback(async()=>{const seq=++sequence.current;try{const d=await routineRequest('/api/routine'+(todayOnly?'?today=1':''));if(!validRoutineResponse(d))throw Error('Carregar rotina: resposta incompleta. Os dados anteriores foram preservados.');if(seq===sequence.current){setData(d.data);latest.current=d.data;setToday(d.today);setLoaded(true);setError('');}}catch(e){if(seq===sequence.current)setError(e instanceof Error?e.message:'Falha ao carregar a rotina.');}finally{if(seq===sequence.current)setLoading(false);}},[todayOnly]);
 useEffect(()=>{try{const raw=sessionStorage.getItem(pendingKey);if(raw)setPending(JSON.parse(raw));}catch{}void refresh();const wake=()=>{if(!flight.current)void refresh();};window.addEventListener('focus',wake);window.addEventListener('online',wake);window.addEventListener('dmp:routine-updated',wake);const interval=setInterval(wake,60000);const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('dmp_routine'):null;if(channel)channel.onmessage=wake;return()=>{sequence.current++;clearInterval(interval);window.removeEventListener('focus',wake);window.removeEventListener('online',wake);window.removeEventListener('dmp:routine-updated',wake);channel?.close();};},[refresh]);
 function notify(){window.dispatchEvent(new Event('dmp:routine-updated'));if(typeof BroadcastChannel!=='undefined'){const c=new BroadcastChannel('dmp_routine');c.postMessage({type:'refresh'});c.close();}}
 async function request(action:string,input:unknown,options:{revision?:number;previewDigest?:string;retry?:RequestBody}={}){
  if(flight.current)throw Error('Aguarde a operação atual.');
  if(pending&&!options.retry)throw Error('Confira primeiro a tentativa anterior.');
  flight.current=true;setBusy(true);setError('');
  const body=options.retry||{action,input,operationId:crypto.randomUUID(),revision:options.revision??latest.current.revision,...(options.previewDigest?{previewDigest:options.previewDigest}:{})};
  if(action!=='preview'){setPending(body);try{sessionStorage.setItem(pendingKey,JSON.stringify(body));}catch{}}
  try{
   const d=await routineRequest('/api/routine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},'save');
   if(action!=='preview'){setPending(null);sessionStorage.removeItem(pendingKey);if(d.data)accept(d.data);notify();}
   return d;
  }catch(e){if(e instanceof RoutineRequestError&&e.status>=400&&e.status<500){setPending(null);try{sessionStorage.removeItem(pendingKey);}catch{}}const message=e instanceof Error?e.message:'Não foi possível conferir a operação.';setError(message);throw e;}
  finally{flight.current=false;setBusy(false);}
 }
 async function upload(file:File,category:string){
  if(flight.current||pending)throw Error('Conclua a operação anterior.');flight.current=true;setBusy(true);setError('');
  try{const form=new FormData();form.set('file',file);form.set('category',category);const d=await routineRequest('/api/routine/import',{method:'POST',body:form},'import');accept(d.data);notify();return d;}
  catch(e){setError(e instanceof Error?e.message:'Falha ao importar. O plano vigente não foi alterado.');throw e;}
  finally{flight.current=false;setBusy(false);}
 }
 return {data,today,loading,loaded,busy,error,setError,pending,refresh,request,upload,accept};
}
