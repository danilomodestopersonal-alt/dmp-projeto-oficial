import insights from '../assessments/AssessmentInsights.module.css';
import records from '../assessments/RecordsConsultation.module.css';
import {rule,classes,media} from './css';
const r=(s:string[],v:string)=>rule('avaliacoes',s,v);
export const avaliacoesCss=[
 r(['.assessment-card-rich','.assessment-trends','.assessment-comparison','.assessment-form-section'],'border:1px solid #d6e1d9!important;border-radius:14px!important;background:#fff!important;padding:18px!important;box-shadow:none!important'),
 r(['.assessment-card-main'],'gap:16px!important;align-items:start!important'),
 r(['.assessment-card-metrics span'],'border-radius:10px!important;padding:12px!important;background:#f4f7f3!important'),
 r(['.assessment-card-metrics small','.assessment-card-date small','.assessment-card-actions small'],'font-size:12px!important;line-height:1.4!important;color:#52665b!important'),
 r(['.assessment-card-metrics b'],'font-size:16px!important;color:#194c40!important'),
 r(['.assessment-control-summary','.assessment-trend-grid','.assessment-compare-grid'],'gap:14px!important'),
 r(classes(insights,'insights'),'gap:16px!important'),
 r(classes(insights,'selector','selectors'),'gap:10px!important;flex-wrap:wrap'),
 r(classes(records,'backdrop'),'z-index:1600!important;padding:16px!important'),
 r(classes(records,'dialog'),'border-radius:16px!important;max-height:calc(100dvh - 32px)!important;overflow:auto!important;padding:20px!important'),
 media(800,r(['.assessment-card-main'],'grid-template-columns:minmax(0,1fr)!important')+r(['.assessment-card-actions'],'justify-items:start!important')+r(['.assessment-card-metrics'],'grid-template-columns:repeat(2,minmax(0,1fr))!important')+r(['.assessment-trend-grid','.assessment-compare-grid'],'grid-template-columns:minmax(0,1fr)!important')),
].join('\n');
