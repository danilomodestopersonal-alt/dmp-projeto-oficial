// Exact reviewed P31 bytes; only historical snapshot tests use this adapter.
'use strict';
const cp=require('node:child_process'),crypto=require('node:crypto'),A=require('node:assert/strict'),path=require('node:path');
const sha=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
module.exports=(file,text)=>{if(require("./p32-approved-files.json").files[file]?.after===sha(text))text=require("./p32-original-files.cjs")(file,text);const m=require('./p31-approved-files.json'),s=m.files[file];if(!s?.before||sha(text)===s.before)return text;A.equal(sha(text),s.after,'P31 changed without review: '+file);const before=cp.execFileSync('git',['show',m.base+':'+file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',maxBuffer:32e6});A.equal(sha(before),s.before);return before;};
