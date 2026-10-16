import week from '../WidgetWeekAgenda.module.css';
import editor from '../WidgetEventEditor.module.css';
import roster from '../calendar/CalendarRosterEditor.module.css';
import {rule,classes,media} from './css';
const r=(s:string[],v:string)=>rule('agenda',s,v);
export const agendaCss=[
 r(['.agenda-view-toolbar'],'border:1px solid #d6e1d9!important;border-radius:14px!important;background:white!important;padding:16px!important;gap:12px!important'),
 r(['.agenda-view-toolbar button'],'border-radius:9px!important;min-height:42px!important;font-size:14px!important;font-family:inherit!important'),
 r(['.agenda-view-toolbar button.active'],'background:#194c40!important;color:white!important'),
 r(['.calendar-preview-row','.calendar-event-row','.agenda-week-day'],'border-radius:12px!important;border-color:#d6e1d9!important'),
 r(['.calendar-event-main small','.calendar-slot-main small','.agenda-week-student'],'font-size:13px!important;line-height:1.5!important'),
 r(classes(week,'toolbar'),'padding:14px!important;border:1px solid #d6e1d9!important;border-radius:12px!important;gap:10px!important'),
 r(classes(week,'event'),'border-radius:8px!important'),
 r([...classes(editor,'modal'),...classes(roster,'modal')],'border-radius:16px!important;max-height:calc(100dvh - 32px)!important;overflow:auto!important;box-sizing:border-box'),
 r([...classes(editor,'backdrop'),...classes(roster,'backdrop')],'z-index:1600!important;padding:16px!important'),
 r([...classes(editor,'head'),...classes(roster,'head')],'position:sticky;top:0;background:white;z-index:3;padding:14px;border-bottom:1px solid #d6e1d9'),
 r([...classes(editor,'footer'),...classes(roster,'actions')],'position:sticky;bottom:0;background:white;z-index:3;padding:14px;flex-wrap:wrap;gap:8px;border-top:1px solid #d6e1d9'),
 media(800,r(['.agenda-view-toolbar'],'flex-direction:column!important;align-items:stretch!important')+r(['.agenda-view-toolbar>div'],'flex-wrap:wrap!important')+r([...classes(editor,'dates'),...classes(roster,'picker')],'grid-template-columns:minmax(0,1fr)!important')),
].join('\n');
