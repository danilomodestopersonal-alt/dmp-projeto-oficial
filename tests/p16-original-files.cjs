// Historical scope assertions reconstruct only exact SHA256-reviewed P15 files.
// Functional gates always execute current production code; P16 scope checks it.
'use strict';
const cp=require('child_process'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=function(file,text){const originalSpec=require('./p16-approved-files.json').files[file];if(originalSpec?.before&&sha(text.replace(/\r\n/g,'\n'))===originalSpec.before)return text.replace(/\r\n/g,'\n');const s=require('./p17-original-files.cjs')(file,text).replace(/\r\n/g,'\n'),m=require('./p16-approved-files.json'),spec=m.files[file];if(!spec?.before||sha(s)===spec.before)return s;assert.equal(sha(s),spec.after,'P16: alteração não revisada '+file);const prior=cp.execFileSync('git',['show',m.base+':'+file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',maxBuffer:32*1024*1024}).replace(/\r\n/g,'\n');assert.equal(sha(prior),spec.before);return prior;};
