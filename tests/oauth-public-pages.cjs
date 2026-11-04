"use strict";
const fs=require('node:fs'),assert=require('node:assert/strict');
const checks=[['sobre','Alunos, treinos e agenda.'],['privacidade','Política de Privacidade'],['termos','Termos de Uso']];
const manifest=JSON.parse(fs.readFileSync('.next/prerender-manifest.json','utf8'));
for(const [route,title] of checks){
 assert.ok(manifest.routes['/'+route],route+' deve ser pre-renderizada e acessível sem sessão');
 const html=fs.readFileSync('.next/server/app/'+route+'.html','utf8');
 assert.ok(html.includes(title),route+' conteúdo ausente');
 for(const href of ['/sobre','/privacidade','/termos','/login'])assert.ok(html.includes('href="'+href+'"'),route+' link ausente: '+href);
 assert.ok(html.includes('danilomodestopersonal@hotmail.com'));
 assert.ok(!/<input[^>]+type="password"/.test(html),route+' não deve exibir formulário de autenticação');
 assert.ok(html.includes('id="conteudo"'));
 console.log('PASS página pública estática: /'+route);
}
const privacy=fs.readFileSync('.next/server/app/privacidade.html','utf8');
for(const text of ['calendar.events','https://myaccount.google.com/connections','https://developers.google.com/terms/api-services-user-data-policy'])assert.ok(privacy.includes(text));
console.log('PASS privacidade: permissão, revogação e política Google disponíveis');
