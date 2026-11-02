// Local browser QA: requires Playwright/Chromium. Windows package runs p26-birthday.cjs without installing browser dependencies.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),http=require('node:http'),H=require('./p15-harness.cjs'),ts=require('typescript');
const {chromium}=require('playwright');
const tmp=process.env.P26_PREVIEW || fs.mkdtempSync(path.join(os.tmpdir(),'dmp-p26-'));fs.mkdirSync(tmp,{recursive:true});
const source=H.read('components/DmpApp.tsx'),ast=ts.createSourceFile('app.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),card=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='SpecialDatesHome').getText(ast);
fs.writeFileSync(path.join(tmp,'birthday.js'),H.compile(H.read('lib/birthday-whatsapp.ts')));
fs.writeFileSync(path.join(tmp,'BirthdayWhatsApp.js'),H.compile(H.read('components/home/BirthdayWhatsApp.tsx')));
fs.writeFileSync(path.join(tmp,'BirthdayWhatsApp.module.css'),'module.exports={backdrop:"backdrop",dialog:"dialog",heading:"heading",image:"image",actions:"actions",message:"message"};');
fs.writeFileSync(path.join(tmp,'entry.js'),H.compile(`const React=require('react');const {useState,useEffect}=React;const {createRoot}=require('react-dom/client');const {useBirthdayWhatsApp}=require('./BirthdayWhatsApp');const today=()=>"2026-11-02",calculateAge=()=>40;${card}\nconst student={id:'synthetic',name:'Bruna Sickler',phone:new URLSearchParams(location.search).get('phone')??'(19) 98765-4321',status:'ACTIVE',birthDate:'1986-11-02'};createRoot(document.getElementById('root')).render(React.createElement(SpecialDatesHome,{students:[student],onStudent(){}}));`));
const W=require('next/dist/compiled/webpack/webpack');W.init();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
let server,browser;
(async()=>{
 await new Promise((resolve,reject)=>W.webpack({mode:'development',devtool:false,entry:path.join(tmp,'entry.js'),output:{path:tmp,filename:'bundle.js'},resolve:{modules:[path.join(H.root,'node_modules'),'node_modules'],alias:{'@/lib/birthday-whatsapp':path.join(tmp,'birthday.js')}},module:{rules:[{test:/\.css$/,type:'javascript/auto'}]}},(error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=H.read('components/home/BirthdayWhatsApp.module.css');
 if(process.env.P26_PREVIEW){
  fs.mkdirSync(path.join(tmp,'.openai'),{recursive:true});fs.writeFileSync(path.join(tmp,'.openai/hosting.json'),JSON.stringify({static:{directory:'public'}}));
  fs.mkdirSync(path.join(tmp,'public/api/settings'),{recursive:true});fs.copyFileSync(path.join(tmp,'bundle.js'),path.join(tmp,'public/bundle.js'));fs.writeFileSync(path.join(tmp,'public/api/settings/profile'),JSON.stringify({data:{birthdayImage:'data:image/png;base64,'+png.toString('base64')}}));
  fs.writeFileSync(path.join(tmp,'public/index.html'),`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px Arial;margin:16px}button,a,textarea{font:inherit}button{padding:8px}${css}</style><p>Teste isolado — nenhum contato real será aberto.</p><label>Simular cópia da imagem <select id="copy-mode"><option value="success">Permitida</option><option value="denied">Bloqueada</option></select></label><p id="opened">Nenhuma conversa solicitada</p><div id="root"></div><script>window.ClipboardItem=class{constructor(data){this.data=data;}};window.open=(url)=>{document.getElementById('opened').textContent='Conversa solicitada: '+url;return null;};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async()=>{if(document.getElementById('copy-mode').value==='denied')throw Error('NotAllowedError');},writeText:async()=>{}}});</script><script src="/bundle.js"></script>`);
  console.log('PREVIEW '+tmp);return;
 }
 server=http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');res.end(fs.readFileSync(path.join(tmp,'bundle.js')));return;}
  if(req.url==='/api/settings/profile'){res.setHeader('content-type','application/json');res.end(JSON.stringify({data:{birthdayImage:'data:image/png;base64,'+png.toString('base64'),birthdayMessage:'OLD MESSAGE MUST NOT WIN'}}));return;}
  res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px Arial;margin:16px}button,a,textarea{font:inherit}button{padding:8px}'+css+'</style><div id="root"></div><script src="/bundle.js"></script>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:360,height:780}:{width:1366,height:900},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  await context.addInitScript(()=>{window.opened=[];window.copyCalls=[];window.shareCalls=0;window.clipboardMode='success';window.open=(...args)=>{window.opened.push(args);return null;};Object.defineProperty(navigator,'share',{value:()=>{window.shareCalls++;throw Error('Forbidden native share');}});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{if(window.clipboardMode==='denied')throw Error('NotAllowedError');window.copyCalls.push(items.length);},writeText:async text=>{window.copiedText=text;}}});});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  // Ensure asynchronous image preparation has completed without interacting with real accounts.
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(x=>x.name.includes('settings/profile')));await page.waitForTimeout(250);
  await page.getByRole('button',{name:'Enviar parabéns'}).click();await page.waitForFunction(()=>window.opened.length===1);
  const opened=await page.evaluate(()=>window.opened[0]);const url=new URL(opened[0]);assert.equal(url.pathname,'/5519987654321');assert.match(url.searchParams.get('text'),/^Parabéns, Bruna! 🎉🎂/);assert.match(opened[2],/noopener/);
  await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('status').innerText(),/Imagem copiada/);assert.equal(await page.evaluate(()=>window.shareCalls),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Copiar mensagem',exact:true}).click();assert.equal(await page.evaluate(()=>window.copiedText),url.searchParams.get('text'));
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar imagem',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'parabens.png');const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),png);
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Enviar parabéns');
  await page.evaluate(()=>window.clipboardMode='denied');const fallback=page.waitForEvent('download');await page.getByRole('button',{name:'Enviar parabéns'}).click();await fallback;await page.waitForFunction(()=>window.opened.length===2);assert.match(await page.getByRole('status').innerText(),/Download.*solicitado/);
  await page.keyboard.press('Escape');
  for(const phone of ['', '1234', '19 98765-4321 ramal 2']){
    await page.goto(origin+'/?phone='+encodeURIComponent(phone));await page.getByRole('button',{name:'Enviar parabéns'}).click();assert.match(await page.getByRole('alert').innerText(),/Nenhuma conversa foi aberta/);assert.equal(await page.evaluate(()=>window.opened.length),0);
  }
  await page.route('**/api/settings/profile',route=>route.fulfill({status:503,body:'unavailable'}));await page.goto(origin);await page.getByRole('button',{name:'Enviar parabéns'}).click();await page.waitForFunction(()=>window.opened.length===1);await page.getByText('Não foi possível consultar a imagem.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Baixar imagem'}).count(),0);
  assert.deepEqual(errors,[]);console.log('PASS P26 BROWSER '+(mobile?'ANDROID-VIEWPORT':'DESKTOP')+': actual card/hook; correct phone/text, image copy, download bytes, denied clipboard fallback, absent/invalid phone, failed profile, Escape/focus, no overflow/share/send.');await context.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(!process.env.P26_PREVIEW)fs.rmSync(tmp,{recursive:true,force:true});});
