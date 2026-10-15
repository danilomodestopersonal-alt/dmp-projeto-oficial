import type {StudentActionTarget} from "./student-action";
export const widgetKinds=["home","agenda","new","student","event","kids","performance","commitment","programmed","attended","absent","remaining","student-action"] as const;
export type WidgetKind=typeof widgetKinds[number];
export function validWidgetDate(date:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+"T12:00:00Z"))&&new Date(date+"T12:00:00Z").toISOString().slice(0,10)===date;}
export type WidgetKidsEntry={date:string;time:string;category:"RED"|"ORANGE"|"GREEN"|"YELLOW";lessonId?:string};
export type WidgetEntry={kind:WidgetKind;date:string;id:string;kids?:WidgetKidsEntry;range?:"week";studentId?:string;action?:StudentActionTarget["action"];time?:string};
export function widgetLink(kind:WidgetKind,date:string,id?:string,kids?:Pick<WidgetKidsEntry,"time"|"category"|"lessonId">){if(!validWidgetDate(date))throw new Error("Data inválida");const p=new URLSearchParams({widget:kind,date});if(id)p.set("id",id);if(kind==="kids"&&kids){p.set("time",kids.time);p.set("category",kids.category);if(kids.lessonId)p.set("lessonId",kids.lessonId);}return (["programmed","attended","absent","remaining"].includes(kind)?"/app/widget?":"/app?")+p;}
export function widgetTarget(search:string):WidgetEntry|null{
 const p=new URLSearchParams(search),kind=p.get("widget") as WidgetKind,date=p.get("date")||"",id=p.get("id")||"";
 if(!widgetKinds.includes(kind)||!validWidgetDate(date)||id.length>256)return null;
 if(kind==="student-action"){
  const studentId=p.get("studentId")||"",action=p.get("action")||"",time=p.get("time")||"";
  if(!id.trim()||!studentId.trim()||studentId.length>256||!["register","presence","absence"].includes(action)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
  return {kind,date,id,studentId,action:action as StudentActionTarget["action"],time};
 }
 const target:WidgetEntry={kind,date,id};
 if(p.has("range")){if(kind!=="agenda"||p.get("range")!=="week")return null;target.range="week";}
 if(kind==="kids"&&(p.has("time")||p.has("category"))){
  const time=p.get("time")||"",category=p.get("category")||"",lessonId=p.get("lessonId")||undefined;
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!["RED","ORANGE","GREEN","YELLOW"].includes(category)||Boolean(lessonId&&lessonId.length>256))return null;
  target.kids={date,time,category:category as WidgetKidsEntry["category"],...(lessonId?{lessonId}:{})};
 }
 return target;
}
export function widgetReturn(value:string|null){if(!value||!(value.startsWith("/app?")||value.startsWith("/app/widget?")||value.startsWith("/app/widget-action?"))||value.length>1024)return "/app";try{const u=new URL(value,"https://dmp.invalid");return u.origin==="https://dmp.invalid"&&["/app","/app/widget","/app/widget-action"].includes(u.pathname)&&widgetTarget(u.search)?u.pathname+u.search:"/app";}catch{return "/app";}}
