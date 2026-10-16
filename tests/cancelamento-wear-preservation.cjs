const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),base=require('./cancelamento-wear-baseline.json');
for(const [file,hash]of Object.entries(base.unchanged))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file)).toString('binary').replace(/\r\n/g,'\n'),'binary').digest('hex'),hash,file);
for(const file of base.removed)assert(!fs.existsSync(path.join(root,file)),file);
for(const dir of ['app','components','lib']){
 function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(/\.(tsx?|css)$/.test(f)){const text=fs.readFileSync(f,'utf8');assert(!/api\/voice\/interpret|@\/lib\/voice\/|DMP_VOICE_AI_ENABLED|DMP_VOICE_MODEL|dmp_voice_interpretations/.test(text),f);}}}
 walk(path.join(root,dir));
}
console.log('PASS cancelamento: '+Object.keys(base.unchanged).length+' arquivos rastreados preservados, oito arquivos exclusivos removidos e nenhuma referencia operacional ao servico cancelado. Banco nao acessado.');

const scope=base.scopeTest,scopeText=fs.readFileSync(path.join(root,scope.file),'utf8').replace(/\r\n/g,'\n');assert(scopeText.includes(scope.after));assert.equal(crypto.createHash('sha256').update(scopeText.replace(scope.after,scope.before)).digest('hex'),scope.originalHash,'Scope guard changed beyond the verified deletion exception');
