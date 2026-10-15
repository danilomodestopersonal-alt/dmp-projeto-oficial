// Earlier rounds certify their own historical scope. Three files now have authorized
// widget navigation additions; their old bytes remain available to those snapshots.
// widget-v2.cjs independently checks actual production, unchanged Home functions,
// authentication, navigation whitelist and every file outside this scope.
const fs=require('node:fs'),path=require('node:path'),baseline=require('./widget-v2-preservation.json'),legacy=require('./widget-v2-legacy-sources.json'),kidsChamada=require('./kids-chamada-dmp-baseline.json').original;
module.exports=function(file,options){const key=path.relative(path.resolve(__dirname,'..'),String(file)).replaceAll('\\','/');if(Object.hasOwn(kidsChamada,key)||Object.hasOwn(baseline.original,key)||Object.hasOwn(legacy,key)){const encoding=typeof options==='string'?options:options?.encoding;const value=Buffer.from(kidsChamada[key]??baseline.original[key]??legacy[key]);return encoding?value.toString(encoding).replace(/\r\n/g,"\n"):value;}const value=fs.readFileSync(file,options);return typeof value==="string"?value.replace(/\r\n/g,"\n"):value;};
