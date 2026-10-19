const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),file='components/kids/KidsPage.tsx',base='59e268b1841239b13cb85d4b248688782ea59af2';
const original=cp.execFileSync('git',['show',base+':'+file],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).replace(/\r\n/g,'\n');
const current=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const start=original.indexOf('            <div className={styles.attendance}>',original.indexOf('id="kids-panel-CHAMADA"')),end=original.indexOf('            </section>',start);assert(start>0&&end>start);
const block=original.slice(start,end);let expected=original.slice(0,start)+original.slice(end);const insertion=expected.indexOf('\n',expected.indexOf('<section id="kids-panel-CHAMADA"'))+1;expected=expected.slice(0,insertion)+block+expected.slice(insertion);
assert.equal(current,expected,'Kids deve conter exclusivamente a movimentação do bloco, com callbacks e condições intactos');
console.log('PASS P02: lista e direitos individuais primeiro; todo o restante do arquivo idêntico à base, incluindo callbacks, abas, saldo, salvamento e reposição.');
