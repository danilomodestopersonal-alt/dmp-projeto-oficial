const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),file='components/home/HomeRefinements.module.css',base='59e268b1841239b13cb85d4b248688782ea59af2';
const original=cp.execFileSync('git',['show',base+':'+file],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n'),current=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
assert(current.startsWith(original),'Estilos anteriores devem permanecer intactos');const addition=current.slice(original.length);
assert.match(addition,/grid-template-columns:minmax\(160px,1.4fr\) minmax\(108px,1fr\) minmax\(130px,1fr\) 52px 52px/);
let depth=0,media=false;for(const line of addition.split('\n')){if(line.startsWith('@media')){assert.equal(line,'@media(min-width:901px){');media=true;depth++;}else if(line==='}'){depth--;media=false;}else if(line.startsWith('.refined')){assert(media&&depth===1);assert(line.startsWith('.refined:global(#dmp-home-modern)'));assert(!line.includes('display:none')||line.includes('.header-clock>span'));}}
assert.equal(depth,0);assert.equal(cp.execFileSync('git',['show',base+':components/DmpApp.tsx'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).replace(/\r\n/g,'\n'),fs.readFileSync(path.join(root,'components/DmpApp.tsx'),'utf8').replace(/\r\n/g,'\n'));
console.log('PASS P03: regras novas limitadas à Home desktop; JSX, atalhos e callbacks intactos. Capturas e medições em CAPTURAS.');
