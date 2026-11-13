'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {emptyRoutine,routineDay} from '@/lib/routine/model';
import type {RoutineData} from '@/types/routine';
type RequestBody={action:string;input:unknown;operationId:string;revision:number;previewDigest?:string};
const pendingKey='dmp.routine.pending.v1';
export function useRoutine(todayOnly=false){
 const [data,setData]=useState<RoutineData>(emptyRoutine),[today,setToday]=useState(routineDay),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState<RequestBody|null>(null);
 const flight=useRef(false),latest=useRef(data),sequence=useRef(0);latest.current=data;
 const accept=(next:RoutineData)=>{sequence.current++;latest.current=next;setData(next);};
 const refresh=useCallback(async()=>{const seq=++sequence.current;try{const r=await fetch('/api/routine'+(todayOnly?'?today=1':''),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.message);if(seq===sequence.current){setData(d.data);latest.current=d.data;setToday(d.today);}}catch(e){if(seq===sequence.current)setError(e instanceof Error?e.message:'Falha ao carregar a rotina.');}finally{if(seq===sequence.current)setLoading(false);}},[todayOnly]);
 useEffect(()=>{try{const raw=sessionStorage.getItem(pendingKey);if(raw)setPending(JSON.parse(raw));}catch{}void refresh();const wake=()=>{if(!flight.current)void refresh();};window.addEventListener('focus',wake);window.addEventListener('dmp:routine-updated',wake);const interval=setInterval(wake,60000);const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('dmp_routine'):null;if(channel)channel.onmessage=wake;return()=>{sequence.current++;clearInterval(interval);window.removeEventListener('focus',wake);window.removeEventListener('dmp:routine-updated',wake);channel?.close();};},[refresh]);
 function notify(){window.dispatchEvent(new Event('dmp:routine-updated'));if(typeof BroadcastChannel!=='undefined'){const c=new BroadcastChannel('dmp_routine');c.postMessage({type:'refresh'});c.close();}}
 async function request(action:string,input:unknown,options:{revision?:number;previewDigest?:string;retry?:RequestBody}={}){
  if(flight.current)throw Error('Aguarde a operação atual.');
  if(pending&&!options.retry)throw Error('Confira primeiro a tentativa anterior.');
  flight.current=true;setBusy(true);setError('');
  const body=options.retry||{action,input,operationId:crypto.randomUUID(),revision:options.revision??latest.current.revision,...(options.previewDigest?{previewDigest:options.previewDigest}:{})};
  if(action!=='preview'){setPending(body);try{sessionStorage.setItem(pendingKey,JSON.stringify(body));}catch{}}
  try{
   const r=await fetch('/api/routine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();
   if(!r.ok){if(r.status>=400&&r.status<500){setPending(null);sessionStorage.removeItem(pendingKey);}throw Error(d.message||'Falha na operação.');}
   if(action!=='preview'){setPending(null);sessionStorage.removeItem(pendingKey);if(d.data)accept(d.data);notify();}
   return d;
  }catch(e){const message=e instanceof Error?e.message:'Não foi possível conferir a operação.';setError(message);throw e;}
  finally{flight.current=false;setBusy(false);}
 }
 async function upload(file:File,category:string){
  if(flight.current||pending)throw Error('Conclua a operação anterior.');flight.current=true;setBusy(true);setError('');
  try{const form=new FormData();form.set('file',file);form.set('category',category);const r=await fetch('/api/routine/import',{method:'POST',body:form}),d=await r.json();if(!r.ok)throw Error(d.message);accept(d.data);notify();return d;}
  catch(e){setError(e instanceof Error?e.message:'Falha ao importar. O plano vigente não foi alterado.');throw e;}
  finally{flight.current=false;setBusy(false);}
 }
 return {data,today,loading,busy,error,setError,pending,refresh,request,upload,accept};
}
