const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto'),ts=require('typescript'),b=require('./consolidated-preservation-baseline.json');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');
for(const [f,h]of Object.entries(b.unchanged))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f)).toString('binary').replace(/\r\n/g,'\n'),'binary').digest('hex'),h,f);
const funcs=s=>new Map(ts.createSourceFile('a.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).statements.filter(x=>ts.isFunctionDeclaration(x)&&x.name).map(x=>[x.name.text,x.getText()]));const old=funcs(b.original['components/DmpApp.tsx']),now=funcs(require('./home-appearance-preservation.cjs').originalApp(read('components/DmpApp.tsx')));
for(const [name,body]of old)if(!['DmpApp','DesktopAgendaRail'].includes(name))assert.equal(now.get(name),body,name);
for(const f of ['app/api/voice/interpret/route.ts','lib/voice/contract.ts','lib/voice/interpret.ts','lib/voice/numbers.ts'])assert(!fs.existsSync(path.join(root,f)),f);
console.log('PASS preservação: '+Object.keys(b.unchanged).length+' arquivos fora do escopo intactos; somente duas funções superiores DmpApp autorizadas; Wear ausente');
