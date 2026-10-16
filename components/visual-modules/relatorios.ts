import {rule,media} from './css';
const r=(s:string[],v:string)=>rule('relatorios',s,v);
export const relatoriosCss=[
 r(['.report-metric-grid'],'gap:14px!important;grid-template-columns:repeat(3,minmax(0,1fr))!important'),
 r(['.report-metric','.month-comparison-panel','.attendance-ranking'],'border:1px solid #d6e1d9!important;border-radius:14px!important;background:white!important;padding:18px!important;box-shadow:none!important'),
 r(['.report-metric strong'],'font-size:28px!important;color:#194c40!important;line-height:1.15'),
 r(['.report-metric small','.report-metric span','.month-comparison-bars span'],'font-size:13px!important;color:#52665b!important;line-height:1.5'),
 r(['.attendance-table button'],'padding:14px 10px!important;gap:12px!important;font-family:inherit!important;font-size:14px!important;border-bottom:1px solid #e0e7e2!important'),
 r(['.month-comparison-bars'],'gap:16px!important'),
 media(800,r(['.report-metric-grid'],'grid-template-columns:repeat(2,minmax(0,1fr))!important')+r(['.month-comparison-bars>div'],'grid-template-columns:minmax(0,1fr)!important;gap:8px!important')+r(['.attendance-table'],'overflow-x:auto!important')+r(['.attendance-table button'],'min-width:560px')),
].join('\n');
