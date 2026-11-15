'use strict';
const A=require('node:assert/strict'),H=require('./p15-harness.cjs');
function hooks(){const values=[];let cursor=0;return {reset(){cursor=0;},react:{useState(initial){const n=cursor++;if(!(n in values))values[n]=typeof initial==='function'?initial():initial;return [values[n],v=>{values[n]=typeof v==='function'?v(values[n]):v}]},useRef(initial){const n=cursor++;return values[n]??(values[n]={current:initial})},useEffect(){},useCallback(f){return f;}}};}
(async()=>{
 const storage=new Map();global.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};global.window={dispatchEvent(){}};global.BroadcastChannel=undefined;
 const hs=hooks(),queue=[],network=async(path,init)=>{A.ok(path.startsWith('/api/routine'));A.equal(init.credentials,'same-origin');A.equal(init.cache,'no-store');const next=queue.shift();if(next instanceof Error)throw next;return next;};
 const load=H.loader({react:hs.react},network),M=load('lib/routine/model.ts'),use=load('components/routine/useRoutine.ts').useRoutine,render=()=>{hs.reset();return use();},success=()=>Response.json({data:M.emptyRoutine(),today:M.routineDay()});
 let api=render();queue.push(new TypeError('Failed to fetch'));await api.refresh();api=render();A.equal(api.loaded,false);A.match(api.error,/Carregar rotina.*conectar/);A.equal(api.loading,false);
 queue.push(success());await api.refresh();api=render();A.equal(api.error,'','successful refresh clears the previous network failure');A.equal(api.loaded,true);
 for(const status of [401,403,404,413,500,502,503]){queue.push(Response.json({message:'synthetic'},{status}));await api.refresh();api=render();A.match(api.error,new RegExp('HTTP '+status));A.equal(api.loaded,true,'last good data retained');queue.push(success());await api.refresh();api=render();A.equal(api.error,'');}
 queue.push(new Response('<html>proxy failure</html>',{status:502}));await api.refresh();api=render();A.match(api.error,/incompleta.*502/);
 queue.push(Response.json({bad:true}));await api.refresh();api=render();A.match(api.error,/resposta incompleta/);A.equal(api.data.revision,0);
 queue.push(success());await api.refresh();api=render();
 const file=new File([Buffer.from('synthetic')],'test.pdf');queue.push(new TypeError('Failed to fetch'));await A.rejects(api.upload(file,'SUPPLEMENT'),/Importar documento/);api=render();A.equal(api.data.files.length,0);A.equal(api.data.versions.length,0);A.equal(api.busy,false);
 queue.push(new TypeError('Lost response'));await A.rejects(api.request('draft',{id:'draft'}));api=render();const pending=api.pending;A.ok(pending?.operationId);A.equal(JSON.parse(storage.get('dmp.routine.pending.v1')).operationId,pending.operationId);
 queue.push(Response.json({ok:true,replayed:true,data:M.emptyRoutine()}));await api.request('draft',pending.input,{retry:pending});api=render();A.equal(api.pending,null);A.equal(storage.size,0);
 const timeout=H.loader({},(path,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('aborted')))))('lib/routine/client.ts');await A.rejects(timeout.routineRequest('/api/routine',{},'load',5),/demorou/);
 // Demonstrate the original sticky error on the exact production base.
 const cp=require('node:child_process'),old=cp.execFileSync('git',['show','0d5459215a2a6eeb5a908c9ab4438d1cf5c47c14:components/routine/useRoutine.ts'],{encoding:'utf8'}),prior=hooks();let fail=true;
 const oldUse=H.loader({react:prior.react},async()=>{if(fail)throw TypeError('Failed to fetch');return success();})('components/routine/useRoutine.ts',old).useRoutine;
 const oldRender=()=>{prior.reset();return oldUse();};let before=oldRender();await before.refresh();fail=false;before=oldRender();await before.refresh();before=oldRender();A.equal(before.error,'Failed to fetch');
 console.log('PASS P38 routine: original stale-error reproduced; recovery, same-origin transport, HTTP diagnostics, invalid JSON, timeout, last-good data, import failure and retry operation ID.');
})().catch(e=>{console.error(e);process.exitCode=1});
