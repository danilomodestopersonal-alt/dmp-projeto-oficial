"use client";
import {useEffect,useState} from "react";
import {widgetTarget} from "@/lib/widget/links";
import WidgetStudentAction from "@/components/WidgetStudentAction";
export default function WidgetActionPage(){
 const [entry,setEntry]=useState<ReturnType<typeof widgetTarget>|undefined>(undefined);
 useEffect(()=>{setEntry(widgetTarget(location.search));},[]);
 if(entry===undefined)return <p role="status">Carregando DMP…</p>;
 if(entry?.kind!=="student-action")return <p role="alert">Link de atendimento inválido. Atualize o widget.</p>;
 return <WidgetStudentAction target={entry}/>;
}
