import s from '../financeiro/FinanceiroPage.module.css';
import {rule,classes,media} from './css';
const r=(names:string[],value:string)=>rule('financeiro',classes(s,...names),value);
export const financeiroCss = [
r(['content'],'padding-top:18px!important'),
r(['tabs', 'filters'],'gap:6px!important;padding:5px 0 12px!important;scrollbar-width:thin;overscroll-behavior-x:contain'),
r(['panel', 'cardInvoice', 'summaryGroup', 'summaryOverviewCard'],'border-radius:14px!important;border:1px solid #d6e1d9!important;box-shadow:0 3px 12px #20382b06!important;padding:18px!important'),
r(['summaryBalance', 'summaryTile'],'border-radius:12px!important;padding:16px!important;min-width:0'),
r(['summaryBalances', 'summaryOverview', 'summaryTiles', 'kpiGrid'],'gap:12px!important'),
r(['row', 'pending', 'receipt', 'historyItem'],'border-radius:10px!important;padding:12px!important;gap:12px!important'),
r(['modal', 'modalLarge', 'expenseModal'],'border-radius:16px!important;max-height:calc(100dvh - 32px)!important;overflow:auto!important;padding:20px!important;box-sizing:border-box'),
r(['modalBackdrop'],'z-index:1600!important;padding:16px!important'),
r(['modalHead'],'position:sticky;top:-20px;background:white;z-index:3;padding:10px 0;border-bottom:1px solid #d6e1d9'),
r(['modalActions'],'position:sticky;bottom:-20px;background:white;z-index:3;padding:12px 0;border-top:1px solid #d6e1d9;flex-wrap:wrap'),
r(['competencePicker'],'font-size:12px!important;color:#52665b!important'),
rule('financeiro',classes(s,'tabs').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('financeiro',classes(s,'filters').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('financeiro',classes(s,'topActions').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('financeiro',classes(s,'inlineActions').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('financeiro',classes(s,'modal').flatMap(x=>[x+' input:not([type=checkbox]):not([type=radio])',x+' select',x+' textarea']),'min-height:42px!important;border-radius:9px!important;border-color:#c2d1c7!important;font-size:14px!important;max-width:100%!important;box-sizing:border-box'),
media(700,r(['modal', 'formGrid', 'voiceExtraFields'],'grid-template-columns:minmax(0,1fr)!important')+r(['modal'],'width:100%!important;padding:16px!important')),
].join('\n');