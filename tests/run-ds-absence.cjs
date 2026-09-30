const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const compile=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tests/tsconfig.ds-absence.json'],{cwd:root,stdio:'inherit'});
if(compile.status!==0) process.exit(compile.status||1);
try {require('../tests/ds-absence.cjs');} finally {process.on('exit',()=>fs.rmSync(path.join(root,'.ds-tests'),{recursive:true,force:true}));}
