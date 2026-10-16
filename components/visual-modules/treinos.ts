import {rule,media} from './css';
const r=(s:string[],v:string)=>rule('treinos',s,v);
export const treinosCss=[
 r(['.overview-row','.slot-workouts','.personal-workout-template-card','.workout-block','.exercise-card','.archived-workout-item'],'border:1px solid #d6e1d9!important;border-radius:14px!important;background:white!important;box-shadow:0 3px 12px #20382b06!important;padding:16px!important;min-width:0'),
 r(['.overview-row'],'margin-bottom:8px!important;gap:14px!important'),
 r(['.overview-row strong','.personal-workout-template-card strong'],'font-size:16px!important;color:#194c40!important;line-height:1.4'),
 r(['.workout-editor-page'],'display:grid;gap:16px'),
 r(['.workout-config-panel','.workout-grid-panel','.workout-dictation-panel'],'margin-top:0!important'),
 r(['.workflow-strip'],'border-radius:12px!important;padding:16px!important;background:#edf4e8!important'),
 r(['.personal-workout-template-grid'],'gap:12px!important'),
 r(['.exercise-editor-list'],'gap:12px!important'),
 r(['.exercise-editor-row'],'padding:14px!important;border:1px solid #d6e1d9!important;border-radius:12px!important;background:#fbfcfa!important;gap:10px!important'),
 r(['.exercise-editor-row input','.exercise-editor-row select','.exercise-editor-row textarea'],'font-family:inherit!important;font-size:14px!important;border:1px solid #c2d1c7!important;border-radius:8px!important;min-height:42px!important;min-width:0!important;max-width:100%!important;box-sizing:border-box'),
 r(['.workout-library-head','.workout-template-actions','.personal-workout-template-actions'],'gap:8px!important;flex-wrap:wrap'),
 media(800,r(['.exercise-editor-row'],'grid-template-columns:32px minmax(0,1fr)!important')+r(['.exercise-editor-row>*:nth-child(n+3)'],'grid-column:2!important')+r(['.personal-workout-template-grid'],'grid-template-columns:minmax(0,1fr)!important')+r(['.overview-row'],'align-items:flex-start!important;flex-wrap:wrap')),
].join('\n');
