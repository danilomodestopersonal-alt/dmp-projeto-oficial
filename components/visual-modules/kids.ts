import balance from '../kids/KidsReplacementBalance.module.css';
import s from '../kids/KidsPage.module.css';
import {rule,classes,media} from './css';
const r=(names:string[],value:string)=>rule('kids',classes(s,...names),value);
export const kidsCss = [
r(['primary', 'active'],'background:#194c40!important;color:#fff!important;border-color:#194c40!important'),
r(['page'],'background:#f3f6f3!important;padding:24px!important;font-family:DMPHomeInter,Inter,Arial,sans-serif'),
r(['hero'],'padding:22px!important;border-radius:16px!important;background:#194c40!important;box-shadow:none!important;gap:16px!important'),
r(['panel', 'classCard', 'stat', 'replacementWorkspaceCard', 'capacityPanel', 'semesterPanel'],'border-radius:14px!important;box-shadow:none!important;border:1px solid #d6e1d9!important'),
r(['panel'],'padding:18px!important'),
r(['tabs'],'gap:6px!important;overflow-x:auto;scrollbar-width:thin'),
r(['lessonRow', 'lessonAttendanceRow'],'padding:12px!important;gap:12px!important;border-radius:10px!important'),
r(['modal', 'lessonModal'],'border-radius:16px!important;max-height:calc(100dvh - 32px)!important;overflow-y:auto!important;box-sizing:border-box'),
r(['modalBackdrop'],'z-index:1600!important;padding:16px!important'),
r(['modalHead'],'position:sticky;top:0;z-index:3;background:white;padding:12px 0;border-bottom:1px solid #d6e1d9'),
r(['modalActions'],'position:sticky;bottom:0;z-index:3;background:white;padding:12px 0;border-top:1px solid #d6e1d9;flex-wrap:wrap'),
r(['lessonStudentName'],'font-size:15px!important;line-height:1.4!important'),
rule('kids',classes(s,'tabs').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('kids',classes(s,'modalActions').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('kids',classes(s,'reportToolbar').map(x=>x+' button'),'min-height:42px!important;border-radius:9px!important;font-family:inherit!important;font-size:14px!important;padding:9px 13px!important'),
rule('kids',classes(s,'modal').flatMap(x=>[x+' input:not([type=checkbox]):not([type=radio])',x+' select',x+' textarea']),'min-height:42px!important;border-radius:9px!important;border-color:#c2d1c7!important;font-size:14px!important;max-width:100%!important;box-sizing:border-box'),
media(700,r(['formGrid', 'grid2', 'replacementWorkspaceGrid'],'grid-template-columns:minmax(0,1fr)!important')+r(['modal'],'width:100%!important;padding:16px!important')+r(['page'],'padding:16px!important')),
rule('kids',classes(balance,'operationPanel','studentBox','operationHero'),'border-radius:14px!important;box-shadow:none!important;padding:18px!important'),
rule('kids',classes(balance,'detailDialog'),'border-radius:16px!important;max-height:calc(100dvh - 32px)!important;overflow:auto!important'),
rule('kids',classes(balance,'detailHead'),'position:sticky;top:0;z-index:3;background:white;padding:14px;border-bottom:1px solid #d6e1d9'),
rule('kids',classes(balance,'detailRow'),'padding:12px!important;font-size:14px!important;line-height:1.5'),
].join('\n');
