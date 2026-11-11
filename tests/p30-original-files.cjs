// Exact reviewed P30 bytes only, used by historical source-preservation checks.
'use strict';
const cp=require('node:child_process'),crypto=require('node:crypto'),A=require('node:assert/strict'),path=require('node:path');
const sha=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
module.exports=(file,text)=>{if(require("./p31-approved-files.json").files[file]?.after===sha(text))text=require("./p31-original-files.cjs")(file,text);const m=require('./p30-approved-files.json'),s=m.files[file];if(!s?.before||sha(text)===s.before)return text;A.equal(sha(text),s.after,'P30 source changed without review: '+file);const prior=cp.execFileSync('git',['show',m.base+':'+file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',maxBuffer:32e6});A.equal(sha(prior),s.before);return prior;};
