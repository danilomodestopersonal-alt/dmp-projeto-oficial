'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),H=require('./p15-harness.cjs');
const B=H.loader()('lib/birthday-whatsapp.ts');
for(const [raw,expected]of [['(19) 98765-4321','5519987654321'],['55 99876-5432','5555998765432'],['(19) 3456-7890','551934567890'],['+55 (19) 98765-4321','5519987654321'],['5519987654321','5519987654321'],['+1 (202) 555-0123','12025550123']])assert.equal(B.birthdayPhone(raw),expected,raw);
for(const raw of [undefined,'','1234','987654321','(00) 98765-4321','(19) 11111-1111','55','001234','19 98765-4321 / 19 98765-4322','19 98765-4321 ramal 2','javascript:5519987654321','+55 19 87654-3210','551998765432199'])assert.equal(B.birthdayPhone(raw),null,String(raw));
const text='Parabéns, Bruna! 🎉🎂\n\nTe desejo muita saúde, felicidade e um ano incrível!\n\nGrande abraço! 💪\n\nDanilo Modesto Personal';
assert.equal(B.birthdayMessage('  Bruna   Sickler  '),text);assert.equal(B.birthdayMessage('Érica Silva').split('\n')[0],'Parabéns, Érica! 🎉🎂');
const person={name:'Bruna Sickler',phone:'(19) 98765-4321'},before=JSON.stringify(person),target=B.birthdayRecipient(person),url=new URL(target.url);
assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/5519987654321');assert.equal(url.searchParams.get('text'),text);assert.equal(JSON.stringify(person),before);assert.equal(B.birthdayRecipient({name:'Sem telefone'}).url,null);
// Compare complete rendered card against LIVE P25, using real JSX and synthetic birthdays.
const current=H.read('components/DmpApp.tsx'),base=cp.execFileSync('git',['show','f7b9fb273f493258acd4c1f55c09d4e52b912e18:components/DmpApp.tsx'],{encoding:'utf8',maxBuffer:32e6});
function extract(s){const ast=ts.createSourceFile('app.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='SpecialDatesHome').getText(ast);}
function card(s){const m={exports:{}},deps={useState:x=>[x,()=>{}],useEffect(){},useBirthdayWhatsApp:()=>({sendBirthday(){},dialog:null}),today:()=>'2026-11-02',calculateAge:()=>40};new Function('require','module','exports',...Object.keys(deps),H.compile(extract(s)+'\nexports.Card=SpecialDatesHome;'))(require,m,m.exports,...Object.values(deps));return renderToStaticMarkup(React.createElement(m.exports.Card,{students:[{...person,id:'birthday',status:'ACTIVE',birthDate:'1986-11-02'},{id:'anniversary',name:'Outro aluno',status:'ACTIVE',startDate:'2025-11-02'}],onStudent(){}}));}
assert.equal(card(current),card(base));
// Only the birthday component and its import may change in the shared Home file.
const normalize=s=>s.replace('import {useBirthdayWhatsApp} from "@/components/home/BirthdayWhatsApp";\n','').replace(extract(s),'BIRTHDAY_COMPONENT');assert.equal(normalize(current),normalize(base));
const hook=H.read('components/home/BirthdayWhatsApp.tsx');assert.doesNotMatch(hook,/navigator\.share|canShare|method\s*:\s*["'](?:POST|PUT|DELETE)/);assert.match(hook,/window.open\(target.url/);assert.match(hook,/noopener,noreferrer/);assert.match(hook,/Nenhuma conversa foi aberta/);assert.match(hook,/Nada é enviado automaticamente/);
(async()=>{
 const data=new Blob(['original bytes'],{type:'image/png'});let fetches=0;
 const imageApi=H.loader({},async()=>{fetches++;return new Response(data,{headers:{'content-type':'image/png'}});})('lib/birthday-whatsapp.ts');
 const image=await imageApi.loadBirthdayImage('data:image/png;base64,dGVzdA==',new AbortController().signal);assert.equal(await image.blob.text(),'original bytes');assert.equal(image.filename,'parabens.png');assert.equal(image.png,image.blob);
 await assert.rejects(()=>imageApi.loadBirthdayImage('javascript:alert(1)',new AbortController().signal));assert.equal(fetches,1);
 const failed=H.loader({},async()=>new Response('error',{status:404}))('lib/birthday-whatsapp.ts');await assert.rejects(()=>failed.loadBirthdayImage('/image',new AbortController().signal));
 Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{}});assert.equal(await B.copyBirthdayImage(image),false);
 globalThis.ClipboardItem=class{constructor(items){this.items=items;}};let copied;globalThis.navigator={clipboard:{write:async items=>{copied=items;}}};assert.equal(await B.copyBirthdayImage(image),true);assert.equal(copied[0].items['image/png'],image.png);
 navigator.clipboard.write=async()=>{throw Error('NotAllowedError');};assert.equal(await B.copyBirthdayImage(image),false);
 console.log('PASS P26: valid/invalid phones, DDD 55, exact message/first name, exact recipient, unchanged cadastro/card/other Home functions, preserved image bytes, load failure, unsupported/denied/successful clipboard; no native share or automatic send.');
})().catch(e=>{console.error(e);process.exitCode=1;});
