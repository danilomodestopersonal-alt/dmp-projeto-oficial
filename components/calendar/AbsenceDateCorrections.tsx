"use client";
import {useState} from "react";
import type {Student} from "@/types/models";
import AttendanceCorrection from "./AttendanceCorrection";
export default function AbsenceDateCorrections({students,onCorrected}:{students:Student[];onCorrected:(students:Student[])=>void}) {
 const [date,setDate]=useState("");
 const rows=students.flatMap(student=>student.sessions.filter(s=>s.source==="ABSENCE"&&s.date===date).map(session=>({student,session})));
 return <details onClick={event=>event.stopPropagation()}><summary>Corrigir ausência de outra data</summary><label>Data da aula<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>{rows.map(({student,session})=><div className="calendar-slot-student" key={student.id+session.id}><span>{student.name} · {session.date.split("-").reverse().join("/")} · {session.calendarEvent?new Date(session.calendarEvent.start).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}):"Horário não informado"}</span><AttendanceCorrection studentId={student.id} session={session} onCorrected={onCorrected}/></div>)}{date&&!rows.length?<p>Nenhuma ausência nesta data.</p>:null}</details>;
}
