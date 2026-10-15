const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),log=[];
function run(name,args){console.log('\nVALIDANDO '+name);const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:12*1024*1024});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error||r.status!==0)throw Error(name+': '+(r.error?.message||'codigo '+r.status));log.push(name);}
try{
 run('compilacao regressao',[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tests/tsconfig.operational.json']);
 const source=fs.readFileSync(path.join(__dirname,'run-operational.cjs'),'utf8');
 const modules=[...source.matchAll(/require\('\.\/([^']+\.cjs)'\)/g)].map(m=>m[1]);
 if(modules.length!==32)throw Error('Lista da regressao existente mudou. Confira antes de continuar.');
 for(const file of modules)run(file,[path.join(__dirname,file)]);
 for(const file of ['kids-chamada-dmp.cjs','kids-chamada-dmp-ui.cjs','kids-chamada-dmp-preservation.cjs','kids-redesign-rules.cjs','kids-redesign-api.cjs','kids-redesign-ui.cjs','kids-redesign-preservation.cjs'])run(file,[path.join(__dirname,file)]);
 fs.writeFileSync(path.join(root,'KIDS_REPAGINACAO_TESTES.json'),JSON.stringify({existingModules:modules.length,newModules:7,passed:log.length,failed:0},null,2));
 console.log('REGRESSAO COMPLETA APROVADA: '+modules.length+' módulos existentes e 7 verificações Kids; processos isolados.');
}catch(e){console.error(e);process.exitCode=1;}finally{fs.rmSync(path.join(root,'.operational-tests'),{recursive:true,force:true});}
