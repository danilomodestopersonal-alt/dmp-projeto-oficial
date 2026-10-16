import {rule,media} from './css';
import type {VisualModule} from './defaults';
export function commonCss(module:VisualModule){const r=(s:string[],v:string)=>rule(module,s,v);return `
[data-dmp-module="${module}"]{--v3-green:#194c40;--v3-graphite:#242d29;--v3-line:#d6e1d9;--v3-muted:#52665b;--v3-surface:#f3f6f3;font-family:DMPHomeInter,Inter,Arial,sans-serif;color:#263b30}
`+[
 r(['.dashboard-main','.app-page'],'background:#f3f6f3!important;font-family:DMPHomeInter,Inter,Arial,sans-serif'),
 r(['.dashboard-content','.content'],'width:auto!important;max-width:1440px!important;min-width:0!important;margin-inline:auto!important;padding:24px!important;box-sizing:border-box!important'),
 r(['.stat-card'],'border:1px solid #d6e1d9!important;border-radius:14px!important;box-shadow:0 3px 12px #20382b06!important;background:white!important;padding:18px!important;min-height:100px!important;min-width:0!important'),
 r(['.stat-card-icon','.stat-icon'],'width:40px!important;height:40px!important;border-radius:11px!important;display:grid!important;place-items:center!important;color:#194c40!important;background:#edf4e4!important'),
 r(['.stat-card>div>span','.stat-card>div>small'],'font-size:13px!important;line-height:1.4!important;color:#52665b!important'),
 r(['.stat-card>div>strong'],'font-size:27px!important;color:#194c40!important'),
 r(['.dashboard-content h2','.content h2'],'color:#194c40;font-size:clamp(19px,1.6vw,24px);letter-spacing:-.025em;line-height:1.25'),
 r(['.dashboard-content h3','.content h3'],'font-size:17px;line-height:1.35;letter-spacing:-.01em'),
 r(['.dashboard-content .muted','.content .muted','.overview-row small','.student-card small'],'color:#52665b!important;font-size:13px!important;line-height:1.5'),
 r(['.dashboard-content .panel','.content .panel'],'background:#fff!important;border:1px solid #d6e1d9!important;border-radius:14px!important;box-shadow:0 3px 12px #20382b06!important;padding:20px!important;min-width:0!important'),
 r(['.primary','.secondary','.text-button','.form-grid input:not([type="checkbox"]):not([type="radio"]):not([type="file"])','.form-grid select','.form-grid textarea'],'font-family:inherit!important;font-size:14px!important;border-radius:9px!important;min-height:42px!important;box-sizing:border-box'),
 r(['.primary'],'background:#194c40!important;color:#fff!important;border:1px solid #194c40!important;padding:10px 16px!important;font-weight:650!important'),
 r(['.secondary'],'background:#fff!important;color:#194c40!important;border:1px solid #c3d3c8!important;padding:10px 14px!important;font-weight:650!important'),
 r(['.form-grid input:not([type="checkbox"]):not([type="radio"]):not([type="file"])','.form-grid select','.form-grid textarea'],'background:#fbfcfa!important;border:1px solid #c2d1c7!important;padding:10px 12px!important;max-width:100%!important;min-width:0!important;color:#263b30!important'),
 r(['.form-grid label'],'font-size:13px!important;line-height:1.45;gap:7px!important'),
 r(['.dashboard-main :is(button,a,input,select,textarea):focus-visible','.content :is(button,a,input,select,textarea):focus-visible','.modal :is(button,input,select,textarea):focus-visible'],'outline:3px solid #7b9858!important;outline-offset:3px!important'),
 r(['.modal-backdrop'],'z-index:1400!important;background:#14251bcc!important;padding:18px!important;overflow-y:auto!important'),
 r(['.modal','.modal-large'],'border-radius:16px!important;background:white!important;max-height:calc(100dvh - 36px)!important;overflow-y:auto!important;padding:20px!important;box-sizing:border-box!important;overscroll-behavior:contain'),
 r(['.modal-head'],'position:sticky!important;top:-20px!important;z-index:3!important;background:white!important;padding:12px 0!important;border-bottom:1px solid #d6e1d9;gap:12px'),
 r(['.modal-actions'],'position:sticky;bottom:-20px;background:white;padding:12px 0;display:flex;flex-wrap:wrap;gap:8px;z-index:3;border-top:1px solid #d6e1d9'),
 r(['.student-profile-primary-tabs'],'gap:8px!important;overflow-x:auto;scrollbar-width:thin;overscroll-behavior-x:contain'),
 r(['.student-profile-primary-tabs button'],'border-radius:10px!important;min-height:52px;font-family:inherit!important'),
 r(['.student-profile-primary-tabs button.active'],'background:#194c40!important;color:white!important'),
 r(['.student-profile-primary-tabs button.active small'],'color:#e4eee8!important'),
 media(800,r(['.dashboard-content','.content'],'padding:16px!important;width:100%!important;max-width:100%!important')+r(['.panel-head','.hero-actions','.report-head-actions'],'flex-wrap:wrap;gap:10px')+r(['.modal','.modal-large'],'width:100%!important;max-height:calc(100dvh - 24px)!important;padding:16px!important')+r(['.modal-backdrop'],'padding:12px!important')+r(['.primary','.secondary','.text-button'],'min-height:44px!important')+r(['.student-profile-primary-tabs button'],'flex:0 0 auto;min-width:130px')),
 '@media(prefers-reduced-motion:reduce){'+r(['.dashboard-main *','.content *'],'scroll-behavior:auto!important;transition:none!important')+'}'
].join('\n');}
