const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.operational-tests');
(async()=>{
try {
 const result=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tests/tsconfig.operational.json'],{cwd:root,stdio:'inherit'});
 if(result.status!==0)process.exitCode=result.status||1;
 else {require('./operational.cjs');await require('./kids-conciliation.cjs');await require('./five-improvements.cjs');await require('./overdue-expenses.cjs');await require('./finance-three.cjs');await require('./finance-recovery.cjs');await require('./master-five.cjs');await require('./fifteen-updates.cjs');await require('./post-live-visual.cjs');await require('./final-home-cards-pix.cjs');await require('./update8.cjs');await require('./home-final.cjs');await require('./home-urgent.cjs');}
} finally {fs.rmSync(output,{recursive:true,force:true});}

})().catch(error=>{console.error(error);process.exitCode=1;});
