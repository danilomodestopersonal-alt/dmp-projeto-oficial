import {PDFDocument,StandardFonts,rgb,PDFFont,PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {ReportStudent,ReportOptions,summarize,priorComparison,displayDate,healthFields,numericLoad,civilToday} from './model';
export type Assets={font:Uint8Array;logo:Uint8Array};
export async function renderEvolution(s:ReportStudent,from:string,to:string,o:ReportOptions,assets:Assets,now=new Date()){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(assets.font,{subset:true}),editorial=await doc.embedFont(StandardFonts.TimesRoman);
 const logo=await doc.embedJpg(assets.logo);const green=rgb(.08,.25,.20),ink=rgb(.12,.18,.16),muted=rgb(.34,.40,.37),lime=rgb(.73,.85,.28),paper=rgb(.96,.97,.95),white=rgb(1,1,1);
 const today=civilToday(now),r=summarize(s,from,to,today);let page:PDFPage,y=0;
 const clean=(v:string)=>Array.from(String(v).replace(/[\u0000-\u001f]/g,' ')).map(c=>font.getCharacterSet().includes(c.codePointAt(0)!)?c:'?').join('');
 const lines=(value:string,size:number,width:number,f=font)=>{const out:string[]=[];let line='';for(const word of clean(value).split(/\s+/)){if(f.widthOfTextAtSize((line?line+' ':'')+word,size)<=width){line+=(line?' ':'')+word;continue;}if(line)out.push(line);line='';for(const c of word){if(f.widthOfTextAtSize(line+c,size)>width){out.push(line);line='';}line+=c;}}if(line)out.push(line);return out;};
 const newPage=()=>{page=doc.addPage([595.28,841.89]);y=760;page.drawText('DMP  /  RELATÓRIO DE EVOLUÇÃO',{x:40,y:805,size:9,font,color:green});page.drawLine({start:{x:40,y:792},end:{x:555,y:792},thickness:1,color:lime});};
 const ensure=(h:number)=>{if(y-h<65)newPage();};
 const text=(value:string,size=11,color=ink,width=515)=>{for(const line of lines(value,size,width)){ensure(size*1.5);page.drawText(line,{x:40,y,size,font,color});y-=size*1.5;}y-=5;};
 const heading=(value:string)=>{ensure(60);y-=12;text(value,19,green);};
 const label=(value:string)=>text(value,10,muted);
 page=doc.addPage([595.28,841.89]);page.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:green});
 const logoW=230,logoH=logo.height*logoW/logo.width;page.drawImage(logo,{x:40,y:735-logoH,width:logoW,height:logoH});
 page.drawText('ACOMPANHAMENTO INDIVIDUAL',{x:40,y:570,size:11,font,color:lime});
 page.drawText('Relatório',{x:40,y:500,size:54,font:editorial,color:white});page.drawText('de Evolução',{x:40,y:438,size:54,font:editorial,color:white});
 let cy=357;for(const l of lines(s.name,25,515)){page.drawText(l,{x:40,y:cy,size:25,font,color:white});cy-=34;}
 if(cy<210)throw Error('Nome muito extenso para a capa. Revise o cadastro antes de gerar.');
 page.drawText(`${displayDate(from)} a ${displayDate(to)}`,{x:40,y:cy-14,size:14,font,color:lime});
 page.drawText('Seu percurso, com clareza e acompanhamento.',{x:40,y:151,size:12,font,color:white});
 const emitted=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(now);
 page.drawText(`Emitido em ${emitted} · São Paulo`,{x:40,y:76,size:9,font,color:white});page.drawText('CONFIDENCIAL · Compartilhamento sob sua revisão',{x:40,y:56,size:9,font,color:white});
 newPage();text(s.name,22,green);label(`${displayDate(from)} a ${displayDate(to)} • Registros disponíveis na emissão`);
 if(r.partial)label('Período parcial: inclui hoje ou datas futuras.');
 if(r.future)label(`${r.future} registros futuros excluídos das contagens.`);
 if(r.invalid)label(`${r.invalid} registros com data inválida no histórico: não é possível situá-los no período.`);
 if(r.conflicts)text(`ATENÇÃO · ${r.conflicts} conflitos identificados. Percentual geral ocultado; revise o histórico.`,12);
 if(!r.total)text('Não há registros de sessões válidos neste período.',14);
 if(o.attendance){heading('01 / Presença nos registros');
 const metrics=[[String(r.present),'Presenças'],[String(r.absent),'Faltas'],[r.frequency===null?'—':`${r.frequency.toFixed(1).replace('.',',')}%`,'Frequência']];ensure(100);
 metrics.forEach(([v,l],i)=>{page.drawRectangle({x:40+i*174,y:y-78,width:163,height:86,color:paper});page.drawText(v,{x:52+i*174,y:y-28,size:29,font,color:green});page.drawText(l,{x:52+i*174,y:y-57,size:10,font,color:ink});});y-=102;
 text(r.frequency===null?'Frequência: sem cálculo disponível.':`${r.present} ÷ ${r.denominator} ocorrências classificadas = ${r.frequency.toFixed(1).replace('.',',')}%.`,12);
 label('O percentual considera presenças e faltas registradas; não representa todas as aulas originalmente previstas.');
 label(`Cobertura: ${r.total} ocorrências disponíveis; ${r.unknown} de origem não classificada. ${r.duplicateIds} repetições de identificador detectadas.`);
 label(`${r.simple} presenças sem exercícios detalhados; ${r.detailed} ocorrências de presença com exercícios.`);
 }
 if(o.constancy&&r.present){heading('02 / Distribuição das presenças');const months:Record<string,number>={};Object.entries(r.days).forEach(([d,n])=>{months[d.slice(0,7)]=(months[d.slice(0,7)]||0)+n;});const max=Math.max(1,...Object.values(months));
 if(!Object.keys(months).length)label('Sem presenças confirmadas para representar.');
 for(const [month,n] of Object.entries(months).sort()){ensure(42);page.drawText(month.split('-').reverse().join('/'),{x:40,y,size:11,font,color:ink});page.drawRectangle({x:115,y:y-3,width:330*n/max,height:12,color:green});page.drawText(String(n),{x:465,y,size:11,font,color:ink});y-=30;}label('Contagem por mês com registros; meses sem registros não comprovam inatividade.');}
 if(o.comparison&&r.total){heading('03 / Períodos equivalentes');const c=priorComparison(s,from,to,today);label(c.reason);if(c.eligible)text(`Anterior (${displayDate(c.priorFrom)} a ${displayDate(c.priorTo)}): ${c.prior.present} presenças e ${c.prior.absent} faltas. Atual: ${r.present} presenças e ${r.absent} faltas.`,12);}
 if(o.workouts&&r.rows.length){heading('04 / Sessões e exercícios registrados');for(const row of r.rows){ensure(60);text(`${displayDate(row.date)} · ${row.status}`,12,green);if(!row.exercises.length)label('Sem exercícios detalhados.');for(const e of row.exercises)text(`${e.name} · ${e.sets||'—'} séries · ${e.reps||'—'} repetições · carga: ${e.load||'não informada'}`,10);}label('Exercícios são cópias do histórico disponível. A ficha atual não foi usada para reconstruir sessões anteriores.');}
 const lc=o.loadComparison;if(lc?.confirmed){const b=numericLoad(lc.before),a=numericLoad(lc.after);if(!b||!a||!lc.unit||b.unit!==a.unit)throw Error('Comparação de cargas inválida.');heading('05 / Comparação de carga revisada');text(`${lc.exercise}: ${b.value} → ${a.value} ${lc.unit}; diferença: ${(a.value-b.value).toFixed(2)} ${lc.unit}.`);label('Equivalência de exercício, execução, unidade e equipamento confirmada pelo profissional. Diferença de carga registrada não é medida de ganho de força.');}
 if(o.health&&o.healthConfirmed){heading('06 / Avaliações selecionadas');label('Dados de saúde incluídos por escolha explícita. Sem interpretação clínica.');for(const a of r.assessments){ensure(65);text(displayDate(a.date),12,green);for(const [k,v] of Object.entries(a.values)){const [name,unit]=healthFields[k as keyof typeof healthFields];text(`${name}: ${v} ${unit}`,11);}}
 if(!r.assessments.length)label('Sem avaliações no período.');if(o.healthEquivalent&&r.assessments.length>1){const first=r.assessments[0],last=r.assessments[r.assessments.length-1];label('Método/equipamento e unidades equivalentes confirmados pelo profissional.');for(const k of Object.keys(healthFields) as (keyof typeof healthFields)[]){const a=first.values[k],b=last.values[k];if(a!==undefined&&b!==undefined)text(`${healthFields[k][0]}: diferença de ${(b-a).toFixed(2)} ${healthFields[k][1]} (${displayDate(first.date)} a ${displayDate(last.date)}).`,10);}}else label('Valores isolados: equivalência de método/equipamento não confirmada.');}
 if(o.message.trim()){heading('Mensagem do seu personal');text(o.message,12);}
 heading('Sobre este documento');label('O histórico pode ter sido editado. Este documento retrata os registros disponíveis na emissão. Registros importados ou sem origem reconhecida não são automaticamente classificados como presença. Não foram estimados duração, tonelagem, metas ou cancelamentos.');
 const pages=doc.getPages();pages.slice(1).forEach((p,i)=>{p.drawText(`DMP · Confidencial                                     ${i+2} / ${pages.length}`,{x:40,y:32,size:9,font,color:muted});});
 doc.setTitle('Relatório de Evolução DMP');doc.setAuthor('Danilo Modesto Personal');doc.setCreationDate(now);return doc.save();
}
