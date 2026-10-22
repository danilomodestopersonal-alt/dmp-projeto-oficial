'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),base='662d169b448891b35791e2d1f6a1c82965a3855a';
const production=['components/DmpApp.tsx','components/home/HomeKidsLessonCard.tsx','components/home/HomeKidsLessonCard.module.css','lib/kids/home-absence.ts'];
const support=['tests/p13-home-absence.cjs','tests/p13-home-preservation.cjs','tests/p13-home-edits.json','tests/p13-original-app.cjs','tests/p12-original-app.cjs','tests/p12-home-kids.cjs','tests/p12-home-kids-harness.cjs','tests/p12-home-kids-preservation.cjs','tests/widget-visual.cjs'];
const allowed=new Set([...production,...support]);module.exports={allowed,production,support};
if(require.main===module){const git=a=>cp.execFileSync('git',a,{cwd:root,maxBuffer:32*1024*1024}),norm=b=>b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n')),read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');let preserved=0;
for(const f of git(['ls-tree','-r','--name-only',base]).toString().trim().split('\n'))if(!allowed.has(f)){assert.deepEqual(norm(fs.readFileSync(path.join(root,f))),norm(git(['show',base+':'+f])),f);preserved++;}
for(const f of [...git(['diff','--name-only',base]).toString().split('\n'),...git(['ls-files','--others','--exclude-standard']).toString().split('\n')].filter(Boolean))assert(allowed.has(f),'Fora do escopo P13: '+f);
assert.equal(require('./p13-original-app.cjs')(read('components/DmpApp.tsx')),norm(git(['show',base+':components/DmpApp.tsx'])).toString());
const action=read('lib/kids/home-absence.ts');assert.doesNotMatch(action,/\/api\/(?!kids)|normalizeKidsData|@\/lib\/db|method:\s*"(?:POST|DELETE|PATCH)"/);assert.equal((action.match(/method:"PUT"/g)||[]).length,1);assert.match(action,/X-DMP-Expected-Updated-At/);assert.match(action,/recordCompletedReplacement/);assert.match(action,/chamadaSaveMatches/);
const card=read('components/home/HomeKidsLessonCard.tsx');assert.doesNotMatch(card,/O × abre a chamada/);assert.match(card,/onClick=\{\(\)=>markAbsent\(student.id\)\}/);assert.match(card,/onClick=\{\(\)=>onOpen\(event\)\}/);assert.match(card,/if\(saving.current/);
assert.doesNotMatch(read('components/home/HomeKidsLessonCard.module.css'),/:global|calendar-preview|central-|#dmp-home|:root/);
console.log('PASS P13 ESCOPO: 4 arquivos de produção, '+preserved+' arquivos preservados integralmente; Personal, KidsPage, API/regras Kids, widgets, Google, Financeiro/PIN e MP intactos.');}
