// Historical scope only: exact reviewed P17 hashes. Behavioral gates use current code.
'use strict';
const cp=require('child_process'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=function(file,text){const s=text.replace(/\r\n/g,'\n'),m=require('./p17-approved-files.json'),spec=m.files[file];if(!spec?.before||sha(s)!==spec.after)return s; // Current file hashes are enforced by p17-scope.cjs.
const prior=cp.execFileSync('git',['show',m.base+':'+file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',maxBuffer:32*1024*1024}).replace(/\r\n/g,'\n');assert.equal(sha(prior),spec.before);return prior;};
