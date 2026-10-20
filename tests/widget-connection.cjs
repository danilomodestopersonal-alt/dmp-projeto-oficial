'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),id='11111111-1111-4111-8111-111111111111';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const nodes=(x,p,out=[])=>{if(Array.isArray(x)){x.forEach(v=>nodes(v,p,out));return out;}if(x?.props){if(p(x))out.push(x);nodes(x.props.children,p,out);}return out;};
const text=x=>x==null||typeof x==='boolean'?'':typeof x==='string'||typeof x==='number'?String(x):Array.isArray(x)?x.map(text).join(''):text(x.props?.children);
async function harness(post,getPair){
 const saved={window:global.window,location:global.location,fetch:global.fetch,confirm:global.confirm};
 const listeners=new Map(),hooks=[],effects=[],requests=[];let cursor=0,tree;
 const win={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};win.self=win;win.top=win;
 global.window=win;global.location={search:'?pair='+id};global.confirm=()=>true;
 const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
 global.fetch=async(url,init={})=>{requests.push({url,method:init.method||'GET',body:init.body});
  if(init.method==='POST')return post(response,url,init);
  if(url.startsWith('/api/widget/devices'))return response({devices:[{id:'22222222-2222-4222-8222-222222222222',name:'Samsung existente',created_at:'2026-10-18T14:18:35Z',revoked_at:null}]});
  return getPair?getPair(response):response({name:'Samsung teste',approved_at:null,expires_at:'2099-10-20T16:18:00Z'});
 };
 const react={useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];},useRef(initial){const i=cursor++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},useEffect(fn){const i=cursor++;if(!(i in hooks)){hooks[i]=true;effects.push(fn);}}};
 const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(root,'app/widget-android/page.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(name=>name==='react'?react:require(name),m,m.exports);
 function render(){cursor=0;tree=m.exports.default();return tree;}
 async function settle(){for(let i=0;i<4;i++){await tick();render();}}
 render();effects.splice(0).forEach(f=>f());await settle();
 return{requests,render,settle,find:p=>nodes(tree,p),text:()=>text(tree),focus:async()=>{listeners.get('focus')?.();await settle();},close(){for(const [k,v]of Object.entries(saved)){if(v===undefined)delete global[k];else global[k]=v;}}};
}
(async()=>{
 const before=require('node:child_process').execFileSync('git',['show','cd45a4fa46e58dfb4b431165ccd64fe95fd80d50:app/widget-android/page.tsx'],{cwd:root});
 assert.equal(require('node:crypto').createHash('sha256').update(before).digest('hex'),'063a0dd86a2d4c097a10d4bf15b096660eb99efd2f542756d7364b21484a6fcf','Preservar prova da página original no histórico real');
 let h=await harness(()=>{throw Error('Não enviar automaticamente');});
 try{
  assert.equal(h.requests.filter(x=>x.method==='POST').length,0);
  const form=h.find(x=>x.type==='form')[0];
  assert.equal(form.props.method,'post');assert.equal(form.props.action,'/api/widget/connect');assert.equal(form.props.onSubmit,undefined);
  const hidden=nodes(form,x=>x.type==='input'&&x.props.name==='id')[0];assert.equal(hidden.props.type,'hidden');assert.equal(hidden.props.value,id);
  const button=nodes(form,x=>x.type==='button')[0];assert.equal(button.props.type,'submit');assert.equal(button.props.onClick,undefined);assert.equal(button.props.disabled,false,'Vínculo antigo não bloqueia a autorização');
  await h.focus();assert.equal(h.requests.filter(x=>x.method==='POST').length,0);console.log('PASS: formulário nativo com ID correto; nenhuma aprovação automática ou interceptação JavaScript.');
 }finally{h.close();}
 let approved=true;
 h=await harness(()=>{throw Error('Não enviar');},r=>r({name:'Samsung teste',approved_at:approved?'2026-10-20T18:25:00Z':null}));
 try{assert.match(h.text(),/Autorizado/);approved=false;await h.focus();assert.match(h.text(),/Autorizado/);assert.equal(h.find(x=>x.type==='button'&&text(x)==='Autorizado')[0].props.disabled,true);console.log('PASS: aprovação confirmada não é desfeita por consulta atrasada.');}finally{h.close();}
 h=await harness((r,url)=>{assert.equal(url,'/api/widget/connection-check');return r({code:'GOOGLE_REAUTH_REQUIRED',googleError:'invalid_grant',upstreamStatus:400,message:'O Google recusou a autorização salva.'},502);});
 try{
  h.find(x=>x.type==='button'&&text(x)==='Verificar acesso à agenda')[0].props.onClick();await h.settle();
  const device=h.find(x=>x.type==='section'&&text(x).includes('Samsung existente'))[0];assert.match(text(device),/GOOGLE_REAUTH_REQUIRED/);assert.match(text(device),/HTTP Google: 400/);assert.match(text(device),/HTTP DMP: 502/);
  await h.focus();assert.match(h.text(),/GOOGLE_REAUTH_REQUIRED/);assert.equal(h.requests.filter(x=>x.method==='POST').length,1);console.log('PASS: diagnóstico aparece junto ao dispositivo e permanece ao alternar aplicativos.');
 }finally{h.close();}
 h=await harness(()=>{throw Error('offline');});
 try{h.find(x=>x.type==='button'&&text(x)==='Verificar acesso à agenda')[0].props.onClick();await h.settle();assert.match(h.text(),/A verificação não foi concluída/);assert.equal(h.find(x=>x.type==='button'&&text(x)==='Verificar acesso à agenda')[0].props.disabled,false);console.log('PASS: falha de rede no diagnóstico permanece visível e libera o botão.');}finally{h.close();}
 h=await harness(()=>{throw Error('Não enviar');},r=>r({error:'Solicitação expirada.'},410));
 try{assert.match(h.text(),/Solicitação expirada/);assert.equal(h.find(x=>x.type==='button'&&text(x).startsWith('Autorizar'))[0].props.disabled,true);console.log('PASS: pedido expirado tem instrução e envio bloqueado.');}finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
