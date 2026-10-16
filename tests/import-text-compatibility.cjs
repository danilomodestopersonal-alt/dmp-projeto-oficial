const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('assert/strict'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
function importer(text){const ast=ts.createSourceFile('a.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const funcs=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name&&['organizeQuickTranscript','detectWorkoutProtocol','normalizeName'].includes(n.name.text)).map(n=>n.getText(ast)).join('\n');const c={crypto:require('crypto').webcrypto};vm.createContext(c);vm.runInContext(ts.transpileModule(funcs,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);return c;}
const actual=importer(fs.readFileSync(path.join(root,'components/DmpApp.tsx'),'utf8'));
const text='Objetivo: Peito\nProtocolo: B7\n\nBloco 1\nSupino reto — 3x15 — 40 kg\nCrucifixo — 3xF';
const result=JSON.parse(JSON.stringify(actual.organizeQuickTranscript(text)));
assert.deepEqual(result.map(({name,sets,reps,load,block})=>({name,sets,reps,load,block})),[{name:'Supino reto',sets:'3',reps:'15',load:'40 kg',block:'1'},{name:'Crucifixo',sets:'3',reps:'F',load:'',block:'1'}]);assert.equal(actual.detectWorkoutProtocol(text),'B7');
const before=importer(cp.execFileSync('git',['show','bc6099335d858726dd850dd102a1b81753355580:components/DmpApp.tsx'],{cwd:root,encoding:'utf8'}));
const strip=x=>JSON.parse(JSON.stringify(x)).map(({id,...e})=>e);
for(const line of ['Supino reto — 3x15 — 40 kg','Bloco 1\nAgachamento 4x12 30 kg\nBloco 2\nRemada 3x10 50 kg','Prancha 3x falha','Bloco 2: Rosca 3 séries de 12 com 15 kg de cada lado','Supino três de quinze quarenta quilos','Remada 3x12; Puxada 4x10','Mobilidade livre','Agachamento 3x12 — 12,5 kg','Bloco 1\nSupino 3x12\nRemada 3x15'])assert.deepEqual(strip(actual.organizeQuickTranscript(line)),strip(before.organizeQuickTranscript(line)),line);
assert(fs.readFileSync(path.join(root,'components/DmpApp.tsx'),'utf8').includes('SpeechRecognition'));
console.log('PASS importador: Objetivo/Protocolo, B7, blocos, 3xF, cargas e nove formatos anteriores preservados; voz do celular mantida.');
