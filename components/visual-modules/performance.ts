import evolution from '../performance/PerformanceEvolution.module.css';
import insights from '../performance/PerformanceSummaryInsights.module.css';
import s from '../performance/PerformancePage.module.css';
import {rule,classes,media} from './css';
const r=(names:string[],value:string)=>rule('performance',classes(s,...names),value);
export const performanceCss = [
r(['page'],'background:#f3f6f3!important;padding:24px!important;font-family:DMPHomeInter,Inter,Arial,sans-serif'),
r(['hero'],'border-radius:16px!important;padding:22px!important;box-shadow:none!important;background:#194c40!important'),
r(['panel', 'metric', 'goalCard', 'recordCard'],'border-radius:14px!important;border:1px solid #d6e1d9!important;box-shadow:none!important;padding:18px!important;min-width:0'),
r(['tabs', 'filters'],'gap:6px!important;overflow-x:auto;scrollbar-width:thin'),
r(['activityRow', 'editableRow'],'padding:12px!important;gap:12px!important;border-radius:10px!important'),
r(['activityMain'],'min-width:0!important;line-height:1.45'),
r(['modal'],'border-radius:16px!important;max-height:calc(100dvh - 32px)!important;overflow:auto!important;padding:20px!important;box-sizing:border-box'),
r(['backdrop'],'z-index:1600!important;padding:16px!important'),
r(['modalHeader'],'position:sticky;top:-20px;z-index:3;background:white;padding:10px 0;border-bottom:1px solid #d6e1d9'),
r(['modalActions'],'position:sticky;bottom:-20px;background:white;padding:12px 0;z-index:3;flex-wrap:wrap;border-top:1px solid #d6e1d9'),
rule('performance',classes(s,'tabs').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('performance',classes(s,'filters').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('performance',classes(s,'rowActions').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('performance',classes(s,'modalActions').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('performance',classes(s,'modal').flatMap(x=>[x+' input:not([type=checkbox]):not([type=radio])',x+' select',x+' textarea']),'min-height:42px!important;border-radius:9px!important;border-color:#c2d1c7!important;font-size:14px!important;max-width:100%!important;box-sizing:border-box'),
media(700,r(['formGrid', 'twoColumns', 'goalGrid'],'grid-template-columns:minmax(0,1fr)!important')+r(['modal'],'width:100%!important;padding:16px!important')+r(['page'],'padding:16px!important')),
rule('performance',[...classes(evolution,'panel'),...classes(insights,'panel')],'border:1px solid #d6e1d9!important;border-radius:14px!important;box-shadow:none!important;padding:18px!important'),
rule('performance',classes(evolution,'month','value'),'font-size:12px!important;line-height:1.4'),
].join('\n');