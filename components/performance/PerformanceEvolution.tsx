"use client";
import {useState} from "react";
import type {PerformanceActivity} from "@/types/performance";
import {performanceEvolution,type EvolutionMetric} from "@/lib/performance-evolution";
import styles from "./PerformanceEvolution.module.css";
const specs={distance:{label:"Distância",unit:"km"},minutes:{label:"Tempo",unit:"min"},elevation:{label:"Altimetria",unit:"m"},count:{label:"Treinos",unit:"atividades"}};
export default function PerformanceEvolution({activities,year,month,onOpenMonth}:{activities:PerformanceActivity[];year:number;month:number;onOpenMonth:(key:string)=>void}){
 const [metric,setMetric]=useState<EvolutionMetric>("distance");const [length,setLength]=useState<3|6|12>(12);
 const series=performanceEvolution(activities,year,month,length),max=Math.max(1,...series.map(item=>item[metric]));const spec=specs[metric];
 return <section className={styles.panel} aria-label="Evolução mensal da Performance"><header><div><small>EVOLUÇÃO · {year}</small><h2>{spec.label} por mês</h2></div><label>Indicador<select value={metric} onChange={e=>setMetric(e.target.value as EvolutionMetric)}>{Object.entries(specs).map(([key,item])=><option key={key} value={key}>{item.label}</option>)}</select></label></header><div className={styles.periods}>{([12,6,3] as const).map(value=><button type="button" key={value} aria-pressed={length===value} onClick={()=>setLength(value)}>{value} meses</button>)}</div><div className={styles.chart}>{series.map(item=><button type="button" key={item.key} className={styles.column} onClick={()=>onOpenMonth(item.key)} aria-label={`${item.label}: ${item[metric].toLocaleString("pt-BR",{maximumFractionDigits:1})} ${spec.unit}; ver ${item.count} atividades`}><span className={styles.value}>{item[metric].toLocaleString("pt-BR",{maximumFractionDigits:1})}</span><span className={styles.track}><span className={styles.bar} style={{height:`${item[metric]/max*100}%`}}/></span><span className={styles.month}>{item.label}</span></button>)}</div><p>{spec.unit} · Cada mês abre a lista de atividades de origem. Mês atual parcial; zero indica ausência de registros para a métrica. Período até {String(month).padStart(2,"0")}/{year}.</p></section>;
}
