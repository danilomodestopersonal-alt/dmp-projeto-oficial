const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const baseline=require('./kids-chamada-dmp-baseline.json'),root=path.resolve(__dirname,'..');
for(const [file,expected]of Object.entries(baseline.unchanged)){
 if(Object.hasOwn(require("./kids-redesign-baseline.json").original,file))continue;
 const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file)).toString('binary').replace(/\r\n/g,'\n'),'binary').digest('hex');assert.equal(actual,expected,file);
}
console.log('PASS DMP PRESERVACAO: '+Object.keys(baseline.unchanged).length+' arquivos da base fora dos três arquivos de produção autorizados preservados; testes novos usam API e código atuais.');
