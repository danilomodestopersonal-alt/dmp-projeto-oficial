// Historical scope gates inspect the exact reviewed P14 source. Functional tests
// execute current production code. P15 scope verifies every current file hash.
'use strict';
const cp=require('child_process'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=function(file,text){const s=text.replace(/\r\n/g,'\n'),manifest=require('./p15-approved-files.json'),spec=manifest.files[file];if(!spec||!spec.before||sha(s)===spec.before)return s;assert.equal(sha(s),spec.after,'P15: alteração não revisada '+file);const base=cp.execFileSync('git',['show',manifest.base+':'+file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',maxBuffer:32*1024*1024}).replace(/\r\n/g,'\n');assert.equal(sha(base),spec.before);return base;};
