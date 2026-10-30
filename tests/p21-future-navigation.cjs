'use strict';
const assert=require('node:assert/strict');
const {loader}=require('./p15-harness.cjs');
let states=[],refs=[],slot=0,ref=0,effects=[];
const react={...require('react'),useState(initial){const i=slot++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){return refs[ref++]??=( {current:initial});},useMemo:f=>f(),useEffect(f,deps){effects.push({f,deps});},useCallback:f=>f};
const load=loader({react});
const Page=load('components/financeiro/FinanceiroPage.tsx').default;
function render(){slot=0;ref=0;effects=[];return Page({students:[]});}
function nodes(t,p){if(!t||typeof t!=='object')return [];if(Array.isArray(t))return t.flatMap(x=>nodes(x,p));return [...(p(t)?[t]:[]),...nodes(t.props?.children,p)];}
function select(t){return nodes(t,n=>n.type==='select')[0];}
function button(t,name){return nodes(t,n=>n.type==='button'&&n.props.children===name)[0];}
function autosave(){return effects.find(x=>String(x.f).includes('saveFinanceCloud'));}
let tree=render();
const original=states[0];const snapshot=JSON.stringify(original);const deps=autosave().deps;
const nextYear=String(new Date().getFullYear()+1),future=nextYear+'-11';
select(tree).props.onChange({target:{value:future}});tree=render();
assert.equal(states[0],original);assert.equal(JSON.stringify(states[0]),snapshot);
assert(autosave().deps.every((v,i)=>Object.is(v,deps[i])),'navigation must not schedule autosave');
assert.equal(select(tree).props.value,future);
assert(JSON.stringify(tree).includes('Consulta futura'));
button(tree,'Personal').props.onClick();tree=render();
assert(button(tree,'+ Mensalidade manual').props.disabled);
const cancellation=nodes(tree,n=>n.type?.name==='InvoiceCancellation')[0];assert(cancellation.props.disabled);
button(tree,'DS Tênis').props.onClick();tree=render();assert(button(tree,'+ Registrar recebimento DS').props.disabled);
select(tree).props.onChange({target:{value:original.currentCompetence}});tree=render();
assert.equal(states[0],original);assert.equal(select(tree).props.value,original.currentCompetence);
assert.equal(JSON.stringify(original),snapshot);
console.log('PASS P21: consulta futura não altera o documento nem dispara autosave; recebimentos e cancelamentos bloqueados; retorno preservado.');
