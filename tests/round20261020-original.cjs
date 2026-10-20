const assert=require('node:assert/strict');
module.exports=(file,text)=>{const e=require('./round20261020-production.json').find(e=>e.file===file);if(!e)return text;const s=text.replace(/\r\n/g,'\n');if(s===e.before)return s;assert.equal(s,e.after,'Alteracao fora do escopo aprovado: '+file);return e.before;};
