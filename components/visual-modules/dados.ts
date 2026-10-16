import backup from '../backup/BackupCenter.module.css';
import {rule,classes,media} from './css';
const r=(s:string[],v:string)=>rule('dados',s,v);
export const dadosCss=[
 r(['.data-grid','.settings-center-grid'],'gap:16px!important'),
 r(['.settings-health-list'],'gap:10px!important;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important'),
 r(['.settings-health-list>div'],'border:1px solid #d6e1d9!important;border-radius:12px!important;padding:14px!important'),
 r(['.settings-health-list small','.settings-message-label'],'font-size:13px!important;line-height:1.5!important'),
 r(classes(backup,'wrapper'),'margin:20px 24px!important;gap:16px!important'),
 r(classes(backup,'hero'),'border-radius:16px!important;padding:22px!important;background:#242d29!important;box-shadow:none!important'),
 r(classes(backup,'panel'),'border:1px solid #d6e1d9!important;border-radius:14px!important'),
 r(classes(backup,'panelHeader','row'),'padding:16px!important;gap:12px!important'),
 r(classes(backup,'stats').map(s=>s+' div'),'border-radius:12px!important;padding:16px!important'),
 r(classes(backup,'stats').map(s=>s+' span'),'font-size:13px!important;color:#52665b!important'),
 r(classes(backup,'modalBackdrop'),'z-index:1700!important;padding:16px!important'),
 r(classes(backup,'modal'),'border-radius:16px!important;max-height:calc(100dvh - 32px)!important;overflow:auto!important;box-sizing:border-box'),
 r(classes(backup,'modalActions'),'position:sticky;bottom:0;background:white;padding:12px 0;flex-wrap:wrap;gap:8px'),
 r(classes(backup,'heroActions','rowActions','modalActions').map(x=>x+' button'),'min-height:42px!important;font-size:14px!important;font-family:inherit!important;border-radius:9px!important'),
 media(800,r(['.data-grid','.settings-center-grid'],'grid-template-columns:minmax(0,1fr)!important')+r(classes(backup,'wrapper'),'margin:16px!important')+r(classes(backup,'stats'),'grid-template-columns:repeat(2,minmax(0,1fr))!important')),
].join('\n');
