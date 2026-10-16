"use client";
import {useEffect,useState,type ReactNode} from 'react';
import {type VisualModule,visualEnabled} from './defaults';
import {ModuleVisualContext} from './MetricIcon';
import {commonCss} from './common';
import {financeiroCss} from './financeiro';
import {mercadoPagoCss} from './mercado-pago';
import {alunosCss} from './alunos';
import {treinosCss} from './treinos';
import {agendaCss} from './agenda';
import {avaliacoesCss} from './avaliacoes';
import {performanceCss} from './performance';
import {kidsCss} from './kids';
import {relatoriosCss} from './relatorios';
import {dadosCss} from './dados';
const styles:Record<VisualModule,string>={financeiro:financeiroCss+mercadoPagoCss,alunos:alunosCss,treinos:treinosCss,agenda:agendaCss,avaliacoes:avaliacoesCss,performance:performanceCss,kids:kidsCss,relatorios:relatoriosCss,dados:dadosCss};
export function useModuleAppearance(){
 const [choices,setChoices]=useState<Record<string,string>>({});
 useEffect(()=>{
  const params=new URLSearchParams(location.search),next:Record<string,string>={};
  for(const key of ['visual3',...Object.keys(styles).map(k=>'visual3_'+k)]){
   const choice=params.get(key);
   try{if(choice==='anterior'||choice==='novo')localStorage.setItem('dmp_'+key,choice);const saved=localStorage.getItem('dmp_'+key);if(saved==='anterior'||saved==='novo')next[key]=saved;}
   catch{if(choice==='anterior'||choice==='novo')next[key]=choice;}
  }
  setChoices(next);
 },[]);
 return choices;
}
export default function ModuleSurface({module,choices,children}:{module:VisualModule|null;choices:Record<string,string>;children:ReactNode}){
 if(!module||!visualEnabled(module,choices.visual3??null,choices['visual3_'+module]??null))return <>{children}</>;
 return <ModuleVisualContext.Provider value={true}><div data-dmp-module={module} style={{display:'contents'}}><style data-dmp-module-styles={module}>{commonCss(module)+styles[module]}</style>{children}</div></ModuleVisualContext.Provider>;
}
