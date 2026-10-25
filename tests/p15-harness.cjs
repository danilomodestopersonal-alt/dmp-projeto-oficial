'use strict';
const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function loader(overrides={},network=()=>{throw Error('NETWORK FORBIDDEN IN TEST');}){
 const cache=new Map();
 function load(file,source){if(!source&&cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);
  function req(id){if(Object.hasOwn(overrides,id))return overrides[id];if(id.endsWith('.css'))return new Proxy({},{get:(_,k)=>String(k)});if(id.startsWith('@/')||id.startsWith('.')){const f=id.startsWith('@/')?id.slice(2):path.posix.join(path.posix.dirname(file),id);return load(['', '.ts','.tsx','.cjs','.json'].map(x=>f+x).find(x=>fs.existsSync(path.join(root,x))));}return require(id);}
  new Function('require','module','exports','fetch',compile(source||read(file)))(req,m,m.exports,network);cache.set(file,m.exports);return m.exports;
 }return load;
}
const date='2026-10-23',event={id:'p15-original-instance',etag:'"e1"',summary:'Aula · Pessoa Teste · Outra Pessoa',start:{dateTime:date+'T06:30:00-03:00'},end:{dateTime:date+'T07:30:00-03:00'},description:'Descrição externa preservada',location:'Quadra'};
const snapshot=()=>({id:event.id,summary:event.summary,start:event.start.dateTime,end:event.end.dateTime,description:event.description,location:event.location});
const session=()=>({id:'absence-1',source:'ABSENCE',date,workoutName:'Ausência',notes:'Observação preservada',completedExercises:[],calendarEvent:snapshot()});
const students=()=>[{id:'person',name:'Pessoa Teste',status:'ACTIVE',sessions:[session()],workouts:[{id:'original-plan'}],assessments:[]},{id:'other',name:'Outra Pessoa',status:'ACTIVE',sessions:[],workouts:[],assessments:[]}];
const json=(body,init)=>({body,status:init?.status||200,headers:new Headers(init?.headers)});
function google(initial=event,options={}){let current=structuredClone(initial),patches=0;const calls=[];const parent={id:'series',etag:'"p1"',summary:'Aula',start:event.start,end:event.end,...options.parent};
 async function fetch(url,init={}){const id=decodeURIComponent(url.split('/').at(-1));calls.push({id,method:init.method||'GET',headers:init.headers});if(options.missing)return new Response('',{status:404});if(init.method==='PATCH'){patches++;if(options.conflict)return new Response('',{status:412});if(init.headers['If-Match']!==current.etag)return new Response('',{status:412});const patch=JSON.parse(init.body);current={...current,...patch,etag:'"e2"'};if(options.lostResponse)throw Error('response lost');return Response.json(current);}return Response.json(id===parent.id?parent:current);}
 return {fetch,calls,get patches(){return patches;},get event(){return current;},parent};
}
module.exports={root,read,compile,loader,date,event,snapshot,session,students,json,google};
