// Only legacy preservation snapshots use this adapter. P29 tests load actual sources.
'use strict';
const cp=require('node:child_process'),crypto=require('node:crypto'),A=require('node:assert/strict'),path=require('node:path');
const hash=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
module.exports=(file,text)=>{const m=require('./p29-approved-files.json'),s=m.files[file];if(!s?.before)return text;A.equal(hash(text),s.after,'P29 source changed without review: '+file);const prior=cp.execFileSync('git',['show',m.base+':'+file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',maxBuffer:32e6});A.equal(hash(prior),s.before);return prior;};
