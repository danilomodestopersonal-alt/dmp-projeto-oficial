// Historical snapshot assertions only. Behavioral tests always load the real current files.
'use strict';
const cp=require('node:child_process'),crypto=require('node:crypto'),A=require('node:assert/strict'),path=require('node:path');
const sha=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
module.exports=(file,text)=>{text=require('./p33-original-files.cjs')(file,text);const m=require('./p32-approved-files.json'),s=m.files[file];if(!s?.before||sha(text)===s.before)return text;A.equal(sha(text),s.after,'P32 changed without review: '+file);const before=cp.execFileSync('git',['show',m.base+':'+file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',maxBuffer:32e6});A.equal(sha(before),s.before);return before;};
