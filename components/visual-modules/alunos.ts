import {rule,media} from './css';
const r=(s:string[],v:string)=>rule('alunos',s,v);
export const alunosCss=[
 r(['.student-grid'],'gap:16px!important;grid-template-columns:minmax(0,1fr)!important'),
 r(['.student-card','.student-profile-command','.student-profile-identity','.student-demographic-card','.overview-row'],'border:1px solid #d6e1d9!important;border-radius:14px!important;box-shadow:0 3px 12px #20382b06!important;background:#fff!important;padding:18px!important;min-width:0'),
 r(['.student-card-headline','.student-card-meta-line'],'flex-wrap:wrap!important;white-space:normal!important;gap:8px!important'),
 r(['.student-card-headline>strong'],'font-size:15px!important;white-space:normal!important'),
 r(['.compact-card-actions'],'flex-wrap:wrap!important;gap:6px!important'),
 r(['.compact-card-actions button'],'font-size:13px!important;min-height:40px!important;padding:8px 10px!important'),
 media(1200,r(['.dashboard-student-card.compact-student-card'],'grid-template-columns:minmax(0,1fr)!important')+r(['.compact-card-actions'],'justify-content:flex-start!important')),
 r(['.student-profile-command'],'margin-bottom:18px!important'),
 r(['.student-profile-tab-text strong'],'font-size:14px!important'),
 r(['.student-profile-tab-text small','.student-card small','.timeline-list time'],'font-size:13px!important;line-height:1.45'),
 r(['.student-profile-identity h1','.student-profile-identity h2'],'color:#194c40!important;letter-spacing:-.03em'),
 r(['.student-analytics-grid'],'gap:14px!important'),
 r(['.timeline-list article'],'gap:12px!important;padding:14px 0!important'),
 media(700,r(['.student-grid','.student-analytics-grid'],'grid-template-columns:minmax(0,1fr)!important')+r(['.student-card','.student-profile-command'],'padding:16px!important')+r(['.student-profile-command-main'],'min-width:0!important')+r(['.timeline-list article'],'grid-template-columns:12px 76px minmax(0,1fr)!important')),
].join('\n');
