// Reconstruct exactly the pre-P11 file for historical hash gates only.
// Behavioral tests read the current production code. The P11 scope gate checks
// every unaffected file and the exact two additions below.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const additions=["import WidgetOccurrenceHistory from \"./WidgetOccurrenceHistory\";\n", "    {widgetEventId&&!loading&&!events.some(e=>e.id===widgetEventId)?<WidgetOccurrenceHistory eventId={widgetEventId} date={anchor} students={students} onOpenStudent={onOpenStudent}/>:null}\n"];
module.exports=function(text){let s=text.replace(/\r\n/g,'\n');if(!s.includes(additions[0]))return s;for(const addition of additions){assert.equal(s.split(addition).length,2,'P11: trecho de navegação divergente');s=s.replace(addition,'');}assert.equal(crypto.createHash('sha256').update(s).digest('hex'),'15089e32958d258523cd853a5f0d04723a6a910c6b66384ecb128023bcbdcf96','P11: mudança no DmpApp além da consulta histórica');return s;};
