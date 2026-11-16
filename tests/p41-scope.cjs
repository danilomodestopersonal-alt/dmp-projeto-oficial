'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),m=require('./p41-approved-files.json');
const git=(...a)=>cp.execFileSync('git',a,{maxBuffer:32e6}),hash=b=>crypto.createHash('sha256').update(b.includes(0)?b:Buffer.from(b.toString().replace(/\r\n/g,'\n'))).digest('hex');
A.equal(m.base,'68f8ba6f327f7a061eeda6ae82758af8968d7396');
A.deepEqual(Object.keys(m.files).sort(),['app/api/finance/invoice-cancellation/route.ts','components/financeiro/FinanceiroPage.tsx','components/financeiro/InvoiceCancellation.module.css','components/financeiro/InvoiceCancellation.tsx']);
for(const [file,s]of Object.entries(m.files)){A.equal(hash(fs.readFileSync(file)),s.after,file);if(s.before)A.equal(hash(git('show',m.base+':'+file)),s.before,file);}
let preserved=0;for(const file of git('ls-tree','-r','--name-only',m.base).toString().trim().split('\n')){if(file.startsWith('tests/')||m.files[file])continue;A.equal(hash(fs.readFileSync(file)),hash(git('show',m.base+':'+file)),file);preserved++;}
for(const file of [...git('diff','--name-only',m.base).toString().trim().split('\n'),...git('ls-files','--others','--exclude-standard').toString().trim().split('\n')].filter(Boolean))A.ok(file.startsWith('tests/')||m.files[file],'Outside P41: '+file);
const file='app/api/finance/invoice-cancellation/route.ts',old=git('show',m.base+':'+file).toString();
const expected=old.replace("import type {Student} from '@/types/models';","import type {Student} from '@/types/models';\nimport type {PoolClient} from 'pg';")
.replace('const client=await pool.connect();','let client:PoolClient|undefined;').replace("  try {\n    await client.query('BEGIN');","  try {\n    client=await pool.connect();\n    await client.query('BEGIN');")
.replace('return NextResponse.json({ok:true,repeated:true});','return NextResponse.json({ok:true,repeated:true,data,updatedAt:new Date(fr.rows[0].updated_at).toISOString()});')
.replace("await client.query('UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1',['finance_v1',JSON.stringify(next)]);","const saved=await client.query('UPDATE dmp_data SET payload=$2,updated_at=NOW() WHERE id=$1 RETURNING updated_at',['finance_v1',JSON.stringify(next)]);\n    const updatedAt=new Date(saved.rows[0].updated_at).toISOString();")
.replace('return NextResponse.json({ok:true});','return NextResponse.json({ok:true,data:next,updatedAt});').replace("    await client.query('ROLLBACK');","    if(client)await client.query('ROLLBACK').catch(()=>{});").replace('client.release();','client?.release();');
A.equal(fs.readFileSync(file,'utf8'),expected,'API retains authorization, locks, MP guard, exact invoice validation, backup and audit');
const before=git('show',m.base+':components/financeiro/FinanceiroPage.tsx').toString(),after=fs.readFileSync('components/financeiro/FinanceiroPage.tsx','utf8');
for(const [a,b]of [['        {tab === "ds"','      {action ? <FinanceActionModal'],['  useEffect(() => {\n    let cancelled = false;','  const cancellationDisabled=']]){
 const endBefore=b==='  const cancellationDisabled='?'  function dispatch(command: FinanceCommand) {':b;
 A.equal(after.slice(after.indexOf(a),after.indexOf(b)).replace(/      \{cancellation\?<InvoiceCancellation[^\n]*\n/,'').replace('    // Ending an invoice request is not a local edit. Never echo a stale document after a lost response.\n    if(invoiceResponseDocument.current===storedData){invoiceResponseDocument.current=null;return;}\n',''),before.slice(before.indexOf(a),before.indexOf(endBefore)),'unrelated loading/autosave and DS/Kids/expense/MP/render preserved');
}
A.ok(!fs.existsSync('lib/mercado-pago/release-reserves.ts'),'P39 absent');
A.equal(git('rev-parse',m.base+'^').toString().trim(),'702db343be045d71b76bae53dfd87b00f8716939');
console.log('PASS P41 scope: four production files; '+preserved+' preserved, including P40 Agenda, financial rules, Kids and Mercado Pago; P39/P23 excluded.');
