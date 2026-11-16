'use strict';
const A=require('node:assert/strict'),{loader}=require('./p15-harness.cjs'),H=require('./p41-harness.cjs');
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const flush=()=>new Promise(r=>setImmediate(r));
function harness(options={}){
 const db=H.database(),state=[],refs=[];let i=0,j=0,revision=db.revision,mode='ok',closed=0,requests=[],saved=[],saving=[];
 const react={useState(v){const n=i++;if(!(n in state))state[n]=typeof v==='function'?v():v;return[state[n],v=>state[n]=typeof v==='function'?v(state[n]):v]},useRef(v){return refs[j++]??={current:v}},useEffect(){}};
 global.sessionStorage={getItem:()=>revision};
 const network=async(url,request)=>{requests.push({url,...request});if(mode==='offline')throw Error('Failed to fetch');if(mode==='invalid')return new Response('html',{status:502});const r=await db.post(JSON.parse(request.body),request.headers);if(mode==='lost')throw Error('lost response after commit');return Response.json(r.body,{status:r.status});};
 const C=loader({react},network)('components/financeiro/InvoiceCancellation.tsx');
 const props={data:H.clone(db.data),invoice:H.clone(db.data.personalInvoices[0]),action:'CANCEL',disabled:false,onSaving:v=>saving.push(v),onSaved:(data,version,message)=>{revision=version;props.data=data;saved.push({data,version,message});},onClose:()=>closed++,...options};
 const render=()=>{i=j=0;return nodes(C.InvoiceCancellation(props))};
 const submit=()=>render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 const reason=value=>render().find(n=>n.type==='textarea').props.onChange({target:{value}});
 return {C,props,db,requests,saved,saving,render,submit,reason,setMode:v=>mode=v,setRevision:v=>revision=v,get closed(){return closed}};
}
(async()=>{
 let h=harness();let t=h.render();A.equal(t.some(n=>n.type==='input'&&n.props.type==='checkbox'),false);A.equal(t.some(n=>n.type==='select'),false);A.ok(JSON.stringify(t).includes('10/11/2026'));h.submit();await flush();A.equal(h.requests.length,0);A.ok(JSON.stringify(h.render()).includes('Informe o motivo'));h.reason('abc');h.submit();await flush();A.equal(h.requests.length,0);
 h.reason('Cancelamento solicitado');h.submit();h.submit();t=h.render();A.ok(t.find(n=>n.type==='button'&&n.props.type==='submit').props.disabled);A.ok(JSON.stringify(t).includes('Processando'));await flush();A.equal(h.requests.length,1);A.equal(h.saved.length,1);A.equal(h.closed,1);A.deepEqual(h.saving,[true,false]);A.ok(h.saved[0].data.personalInvoices[0].cancellation.active);A.match(h.saved[0].message,/Totais atualizados/);
 console.log('PASS P41 diálogo: identificação, motivo explícito, sem checkbox, carregamento, duplo clique e atualização confirmada');
 h=harness();h.reason('Motivo válido');h.props.data.personalInvoices[0].expectedAmount=700;h.submit();await flush();A.equal(h.requests.length,0);A.match(JSON.stringify(h.render()),/cobrança mudou/);
 h=harness({disabled:true});h.reason('Motivo válido');h.submit();await flush();A.equal(h.requests.length,0);A.match(JSON.stringify(h.render()),/sincronização/);
 console.log('PASS P41 revisão capturada e sincronização bloqueiam confirmação desatualizada');
 for(const mode of ['offline','lost','invalid']){
  h=harness();h.setMode(mode);h.reason('Motivo válido');h.submit();await flush();A.equal(h.saved.length,0);A.equal(h.closed,0);A.ok(h.render().some(n=>n.props?.role==='alert'));A.ok(h.render().find(n=>n.type==='textarea').props.disabled);A.ok(JSON.stringify(h.render()).includes('Tentar novamente'));
  if(mode==='lost')A.equal(h.db.writes,1);else A.equal(h.db.writes,0);
  const first=JSON.parse(h.requests[0].body);h.setMode('ok');h.submit();await flush();A.equal(h.saved.length,1);A.equal(h.db.writes,1);A.equal(h.db.data.invoiceCancellationAudit.length,1);A.deepEqual(JSON.parse(h.requests[1].body),first);A.equal(h.requests.length,2);
 }
 console.log('PASS P41 offline, erro HTTP e resposta perdida: sem falso sucesso; retry usa a mesma operação');
 h=harness();h.db.authorized=false;h.reason('Motivo válido');h.submit();await flush();A.equal(h.saved.length,0);A.match(JSON.stringify(h.render()),/Sessão inválida/);A.equal(h.db.writes,0);
 const data=H.fixture(),invoice=data.personalInvoices[0];A.equal(h.C.InvoiceCancelButton({invoice:{...invoice,payments:[{id:'p',amount:600}]},disabled:false,onCancel(){}}),null);A.equal(h.C.InvoiceCancelButton({invoice:{...invoice,cancellation:{active:true}},disabled:false,onCancel(){}}),null);A.ok(h.C.InvoiceCancelButton({invoice,disabled:false,onCancel(){}}));
 h=harness();const result=await h.db.post(H.command(h.db.data));h.props.data=result.body.data;h.props.invoice=H.clone(result.body.data.personalInvoices[0]);h.props.action='RESTORE';h.setRevision(result.body.updatedAt);h.reason('Restauração solicitada');h.submit();await flush();A.equal(h.saved.length,1);A.equal(h.db.data.invoiceCancellationAudit.length,2);A.match(h.saved[0].message,/restaurada/);
 const history=JSON.stringify(nodes(h.C.InvoiceCancellationHistory({data:h.db.data,disabled:false,onRestore(){}})));A.match(history,/operator@synthetic.invalid/);A.match(history,/Restauração solicitada/);A.match(history,/Restaurada/);A.match(history,/Cancelada/);
 console.log('PASS P41 sessão inválida, cobrança paga/cancelada, restauração e histórico anterior preservado');
})().catch(e=>{console.error(e);process.exitCode=1});
