import type {RoutinePage,RoutineItem,RoutineCategory,RoutineEvidence} from '@/types/routine';
const clean=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const when=/^(?:com\s+(?:o|a)\s+|[aà]s?|aos?\s+)?(almo[cç]o|jantar|caf[eé]\s+da\s+manh[aã]|lanche(?:\s+da\s+tarde|\s+da\s+manh[aã])?|ceia|noite|manh[aã]|tarde|todo\s+dia|todos\s+os\s+dias|pedal|(?:[01]?\d|2[0-3])(?:\s*h\s*(?:[0-5]\d)?|:[0-5]\d))\s*(?:[|\t:–—-]\s*)?(.*)$/i;
const weekdays=[['domingo',0],['segunda',1],['terca',2],['quarta',3],['quinta',4],['sexta',5],['sabado',6]] as const;
function timing(label:string){const n=clean(label);if(/almo/.test(n))return 'Com o almoço';if(/jantar/.test(n))return 'Com o jantar';if(/todo/.test(n))return 'Horário livre';if(/pedal/.test(n))return 'Durante o pedal';if(/noite/.test(n))return 'À noite';return label.trim();}
function clock(value:string){const m=value.match(/\b([01]?\d|2[0-3])\s*(?:h\s*([0-5]\d)?|:([0-5]\d))\b/i);return m?m[1].padStart(2,'0')+':'+(m[2]||m[3]||'00'):'';}
export function extractRoutine(pages:RoutinePage[],category:RoutineCategory){
 const all=pages.map(p=>p.text).join('\n'),lines=all.split('\n').map(x=>x.trim()).filter(Boolean);
 const title=(lines.find(l=>/rotina|plano|suplementa|alimenta|dieta/i.test(l))||'Documento em conferência').slice(0,200);
 const date=all.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/),sourceDate=date?date[3]+'-'+date[2]+'-'+date[1]:'';
 const sourceVersion=(all.match(/(?:^|\n)[^\n]{0,80}?\b(?:vers[aã]o|revis[aã]o)\s*[:#–—-]?\s*([A-Za-z0-9][^\n]{0,79})/i)?.[1]||'').trim();
 const hasSchedule=/hor[aá]rios?\s+(?:para\s+o\s+)?dia\s+a\s+dia|rotina\s+di[aá]ria|programa[cç][aã]o\s+di[aá]ria/i.test(all);
 const items:RoutineItem[]=[],warnings:string[]=[];let scheduleStarted=!hasSchedule,caution=false,context='',contextLine='',contextDays:number[]=[];
 for(const page of pages){
  for(const raw of page.text.split('\n')){
   const line=raw.replace(/\s+/g,' ').trim();if(!line)continue;
   if(/hor[aá]rios?\s+(?:para\s+o\s+)?dia\s+a\s+dia|rotina\s+di[aá]ria|programa[cç][aã]o\s+di[aá]ria/i.test(line)){scheduleStarted=true;continue;}
   if(/^(?:aten[cç][aã]o|ressalvas?|cuidados?|contraindica|observa[cç][oõ]es|alertas?|importante)\b/i.test(line)){caution=true;warnings.push(line);continue;}
   if(caution){if(!/^(fontes?|imagens?|p[aá]gina|--)/i.test(line))warnings.push(line);continue;}
   if(!scheduleStarted||/^(quando|o que tomar|hor[aá]rio|fontes?|imagens?|--)/i.test(line))continue;
   let body=line;const weekHeader=clean(line).match(/^((?:domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)(?:(?:\s*(?:,|e|\/)\s*)(?:domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado))*)(?:\s*[:–—]\s*|\s*$)(.*)$/);if(weekHeader){contextDays=weekdays.filter(([w])=>weekHeader[1].includes(w)).map(([,d])=>d);contextLine=line;body=line.slice(line.length-weekHeader[2].length).trim();if(!body)continue;}
   const matched=body.match(when);let label=context;
   if(matched){label=matched[1];body=matched[2].trim();context=label;if(!body){contextLine=line;continue;}}
   const colon=body.indexOf(':'),dash=body.search(/\s[–—-]\s/);
   let name='',detail='';
   if(colon>0){name=body.slice(0,colon).trim();detail=body.slice(colon+1).trim();}
   else if(dash>0){name=body.slice(0,dash).trim();detail=body.slice(dash+3).trim();}
   else if(category==='FOOD'&&label){name=body;detail=body;}
   else continue;
   if(!name||name.length>200||/^(fontes?|imagens?|data|vers[aã]o|calcio)$/i.test(name))continue;
   const dose=detail.match(/(?:come[cç]ar\s+com\s+)?(\d+(?:[.,]\d+)?)\s*(comprimidos?|c[aá]psulas?|g\b|mg\b|mcg\b|m[lL]\b|UI\b|fatias?|por[cç][aã]o|por[cç][oõ]es|unidades?|colheres?)/i);
   if(!dose&&!/necess[aá]rio|treino|pedal/i.test(label+' '+detail)&&category!=='FOOD')continue;
   const normalized=clean(label+' '+detail),conditional=/se necessario|somente se|apenas em|somente em|pedal|quando/.test(normalized);
   const explicitDays=weekdays.filter(([w])=>normalized.includes(w)).map(([,d])=>d),days=explicitDays.length?explicitDays:[...contextDays];
   const daily=hasSchedule||/todo(?:s)? (?:o |os )?dia|diari|\/\s*dia/.test(normalized);
   const source:RoutineEvidence={page:page.page,excerpt:[contextLine,line].filter(Boolean).join(' · ').slice(0,8000),confidence:page.method==='OCR'?'OCR_REVIEW':'TEXT'};
   const item:RoutineItem={id:'item-'+(items.length+1),category,name,quantity:dose?.[1]||'',unit:dose?.[2]||'',timing:timing(label),clock:clock(label),frequency:days.length?'WEEKDAYS':daily?'DAILY':'REVIEW',days,condition:conditional?detail:'',conditional,cyclingOnly:false,instructions:detail,notes:'',reviewed:false,evidence:{name:source,quantity:dose?source:{...source,confidence:'UNRESOLVED'},unit:dose?source:{...source,confidence:'UNRESOLVED'},timing:label?source:{...source,confidence:'UNRESOLVED'},days:days.length||daily?source:{...source,confidence:'UNRESOLVED'},condition:source,instructions:source}};
   const key=clean(item.name+'|'+item.timing+'|'+item.instructions);
   if(items.some(x=>clean(x.name+'|'+x.timing+'|'+x.instructions)===key))continue;
   items.push(item);if(items.length>=100){warnings.push('Limite de 100 itens atingido. Confira o documento completo antes de aprovar.');break;}
  }
 }
 if(!items.length)warnings.push('Nenhum item foi identificado com segurança. O original está disponível; preencha manualmente e confira antes de aprovar.');
 if(pages.some(p=>p.method==='OCR'))warnings.push('Texto obtido por OCR: confira nomes, quantidades, unidades e ressalvas no original.');
 if(items.some(i=>i.frequency==='REVIEW'))warnings.push('O documento não definiu a frequência de alguns itens. Selecione os dias na conferência.');
 return {title,sourceDate,sourceVersion,items,warnings:[...new Set(warnings)]};
}
