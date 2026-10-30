// Only historical source/hash gates use this adapter. P20 and financial behavioral tests execute actual files.
'use strict';
const cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
module.exports=(file,text)=>{const m=require('./p20-approved-files.json'),spec=m.files[file];if(!spec)return text;const h=sha(text);if(h===spec.before)return text;assert.equal(h,spec.after,'P20: fonte modificada sem revisao '+file);const old=cp.execFileSync('git',['show',m.base+':'+file.replaceAll('\\','/')],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(sha(old),spec.before);return old;};
