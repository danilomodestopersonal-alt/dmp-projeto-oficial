const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const spec=require('./home-appearance-approved-edits.json');
function originalApp(text){let result=text.replace(/\r\n/g,'\n');for(const [before,after] of [...spec.edits].reverse()){assert.equal(result.split(after).length-1,1,'Alteracao visual inesperada: '+after.slice(0,60));result=result.replace(after,before);}assert.equal(crypto.createHash('sha256').update(result).digest('hex'),spec.base,'Logica original do DmpApp foi alterada');return result;}
module.exports={originalApp};
if(require.main===module){originalApp(fs.readFileSync(path.join(__dirname,'../components/DmpApp.tsx'),'utf8'));console.log('PASS Home: todas as diferencas no DmpApp pertencem a lista visual aprovada; restante identico a base');}
