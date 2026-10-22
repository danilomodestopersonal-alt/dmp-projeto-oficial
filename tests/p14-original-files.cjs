// Restore only reviewed, bounded P14 edits for historical source gates.
// Current functional/browser tests always execute current production sources.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=function(file,text){let s=text.replace(/\r\n/g,'\n');const spec=require('./p14-approved-edits.json')[file];if(!spec||sha(s)===spec.baseSha256)return s;assert.equal(sha(s),spec.modifiedSha256,'P14: fonte fora das alterações revisadas: '+file);for(const edit of [...spec.edits].reverse()){assert.equal(s.split(edit.after).length,2,'P14: trecho divergente: '+file);s=s.replace(edit.after,edit.before);}assert.equal(sha(s),spec.baseSha256,'P14: base não reconstruída: '+file);return s;};
