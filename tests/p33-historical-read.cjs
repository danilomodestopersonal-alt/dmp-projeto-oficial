'use strict';
const fs=require('node:fs'),path=require('node:path');
module.exports=(file,opt)=>{const b=fs.readFileSync(file,opt),key=path.relative(path.resolve(__dirname,'..'),path.resolve(file)).replaceAll('\\','/');if(!require('./p33-approved-files.json').files[key]?.before)return b;const old=require('./p33-original-files.cjs')(key,b.toString());return typeof b==='string'?old:Buffer.from(old);};
