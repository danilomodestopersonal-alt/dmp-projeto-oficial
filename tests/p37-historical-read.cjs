'use strict';
const fs=require('node:fs'),path=require('node:path');
module.exports=(file,opt)=>{const b=require('./p37b-historical-read.cjs')(file,opt),key=path.relative(path.resolve(__dirname,'..'),path.resolve(file)).replaceAll('\\','/');if(!require('./p37-approved-files.json').files[key]?.before)return b;const old=require('./p37-original-files.cjs')(key,b.toString());return typeof b==='string'?old:Buffer.from(old);};
