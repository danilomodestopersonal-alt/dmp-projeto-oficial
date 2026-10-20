'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),base='feab1f33ae90a9b68f885f852a2518cc562601ca';
const allowed=new Set(['app/api/mercado-pago/route.ts','components/mercado-pago/MercadoPagoTestPage.tsx','lib/mercado-pago/outgoing-identity.ts','tests/p10-mp-identification.cjs','tests/p10-mp-preservation.cjs','tests/widget-visual.cjs','tests/tsconfig.operational.json','tests/final-home-cards-pix.cjs','tests/widget-v2-legacy-read.cjs']);
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:32000000});
const norm=b=>b.includes(0)?b:Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));
const files=git(['ls-tree','-r','--name-only',base]).toString().trim().split('\n');let preserved=0;
for(const file of files){if(allowed.has(file))continue;assert.deepEqual(norm(fs.readFileSync(path.join(root,file))),norm(git(['show',base+':'+file])),file);preserved++;}
const changed=[...git(['diff','--name-only',base]).toString().split('\n'),...git(['ls-files','--others','--exclude-standard']).toString().split('\n')].filter(Boolean);
for(const file of changed)assert(allowed.has(file),'FORA DO ESCOPO: '+file);
function functions(source){const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true);return new Map(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name).map(n=>[n.name.text,n.getText(ast).replace(/\r\n/g,'\n')]));}
const old=functions(git(['show',base+':app/api/mercado-pago/route.ts']).toString()),current=functions(fs.readFileSync(path.join(root,'app/api/mercado-pago/route.ts'),'utf8'));
for(const [name,code]of old)if(!['settlementMovements','releaseMovements'].includes(name))assert.equal(current.get(name),code,'Funcao financeira/de rede alterada: '+name);
assert.equal(current.size,old.size,'Funcao extra inesperada na rota');
console.log('PASS P10 ESCOPO: 3 arquivos de producao autorizados; '+preserved+' arquivos preservados. Funcoes de persistencia, classificacao, fingerprints, automacao e leitura dos relatorios identicas ao LIVE.');
