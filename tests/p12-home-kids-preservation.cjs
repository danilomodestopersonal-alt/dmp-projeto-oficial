'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='c7433782b323d91cefaefb032fd3f3584efbf85c';
const production=['components/DmpApp.tsx','components/home/HomeKidsLessonCard.tsx','components/home/HomeKidsLessonCard.module.css','lib/kids/home-card.ts'];
const support=['tests/p12-home-kids.cjs','tests/p12-home-kids-harness.cjs','tests/p12-home-kids-preservation.cjs','tests/p12-home-kids-edits.json','tests/p12-original-app.cjs','tests/p11-original-app.cjs','tests/p11-widget-preservation.cjs','tests/widget-visual.cjs'];
const allowed=new Set([...production,...support]);
module.exports={production,support,allowed};
if(require.main===module){
 const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024});
 const norm=b=>b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n')),read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');
 let preserved=0;
 for(const f of git(['ls-tree','-r','--name-only',base]).toString().trim().split('\n')){if(allowed.has(f))continue;assert.deepEqual(norm(fs.readFileSync(path.join(root,f))),norm(git(['show',base+':'+f])),f);preserved++;}
 for(const f of [...git(['diff','--name-only',base]).toString().split('\n'),...git(['ls-files','--others','--exclude-standard']).toString().split('\n')].filter(Boolean))assert(allowed.has(f),'Fora do escopo P12: '+f);
 assert.equal(require('./p12-original-app.cjs')(read('components/DmpApp.tsx')),norm(git(['show',base+':components/DmpApp.tsx'])).toString());
 const css=read('components/home/HomeKidsLessonCard.module.css');
 assert.doesNotMatch(css,/:global|calendar-preview|central-|home-personal|#dmp-home|:root|\b(?:html|body)\s*[{,]/);
 for(const f of ['components/home/HomeKidsLessonCard.tsx','lib/kids/home-card.ts'])assert.doesNotMatch(read(f),/\b(?:fetch|INSERT|UPDATE|DELETE|PATCH|POST|registerAbsence|refreshAccessToken)\b|@\/lib\/db|normalizeKidsData\(/,'Novo card somente leitura: '+f);
 const fresh=read('components/DmpApp.tsx'),old=norm(git(['show',base+':components/DmpApp.tsx'])).toString();assert.equal((fresh.match(/fetch\(/g)||[]).length,(old.match(/fetch\(/g)||[]).length,'Nenhuma nova requisição');
 for(const f of ['components/kids/KidsPage.tsx','lib/kids/seed.ts','app/api/kids/route.ts','types/kids.ts','components/HomeStudentActions.tsx','components/HomeCentral.module.css','components/home/HomeRefinements.module.css','app/globals.css'])assert.equal(read(f),norm(git(['show',base+':'+f])).toString(),f);
 console.log('PASS P12 ESCOPO: 4 arquivos de produção; '+preserved+' arquivos existentes preservados integralmente. DmpApp com sete mudanças exatas isoladas para Kids. Personal, CSS compartilhado, API Kids, regras, widgets, Google, Financeiro/PIN e MP preservados. Nenhuma escrita ou nova requisição.');
}
