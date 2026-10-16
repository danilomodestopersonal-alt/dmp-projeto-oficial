const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../components/navigation/appearance.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function run(flag,search,saved,blocked=false){let state,updates=[];const mod={exports:{}};const storage={getItem:k=>{assert.equal(k,'dmp_shared_visual_v2');if(blocked)throw Error('blocked');return saved;},setItem:(k,v)=>{assert.equal(k,'dmp_shared_visual_v2');if(blocked)throw Error('blocked');saved=v;updates.push(v);}};new Function('require','module','exports','window','localStorage',code)(id=>id==='react'?{useState:initial=>{state=initial;return[initial,v=>state=v]},useEffect:fn=>fn()}:{ROUND2_VISUAL_DEFAULT:flag},mod,mod.exports,{location:{search}},storage);mod.exports.useSharedAppearance();return {state,saved,updates};}
assert.equal(run(true,'',null).state,true);
assert.equal(run(true,'?visual2=anterior',null).state,false);
assert.equal(run(true,'','anterior').state,false);
assert.equal(run(true,'?visual2=novo','anterior').state,true);
assert.equal(run(false,'?visual2=novo','novo').state,false);
assert.equal(run(true,'?visual2=anterior',null,true).state,false);
assert.deepEqual(run(true,'?visual2=outro',null).updates,[]);
console.log('PASS: preferencia anterior/novo, persistencia, armazenamento bloqueado e reversao global prevalecem sem escrever dados de negocio');
