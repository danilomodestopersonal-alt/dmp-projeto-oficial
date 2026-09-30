const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.operational-tests');
try {
 const result=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tests/tsconfig.operational.json'],{cwd:root,stdio:'inherit'});
 if(result.status!==0)process.exitCode=result.status||1;
 else require('./operational.cjs');
} finally {fs.rmSync(output,{recursive:true,force:true});}
