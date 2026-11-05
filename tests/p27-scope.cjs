const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const m=require('./p27-approved-files.json'),hash=b=>crypto.createHash('sha256').update(b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n'))).digest('hex');
for(const [file,s]of Object.entries(m.files)){assert.equal(hash(fs.readFileSync(file)),s.after,file);if(s.before)assert.equal(hash(cp.execFileSync('git',['show',m.base+':'+file],{maxBuffer:32e6})),s.before,file);}
for(const f of cp.execFileSync('git',['ls-tree','-r','--name-only',m.base],{encoding:'utf8'}).trim().split('\n')){if(f.startsWith('tests/')||m.files[f])continue;assert.equal(hash(fs.readFileSync(f)),hash(cp.execFileSync('git',['show',m.base+':'+f],{maxBuffer:32e6})),f);}
console.log('PASS P27 SCOPE: only approved files; Finance, Kids, replacements, Android and layouts preserved.');
