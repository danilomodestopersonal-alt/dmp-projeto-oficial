"use client";
import type {financeSummary} from "@/lib/financeiro/calculos";
import styles from "./FinanceiroPage.module.css";
const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
type Destination="personal"|"ds"|"expenses"|"extras";
type IconName="wallet"|"bank"|"bars"|"income"|"expense"|"personal"|"tennis"|"kids"|"trophy"|"calendar"|"check"|"clock"|"document"|"extra"|"dollar";
const paths:Record<IconName,string>={wallet:"M4 7h16v13H4z M4 7V4h13v3 M15 11h6v5h-6z",bank:"M3 9l9-6 9 6H3z M5 10v9 M10 10v9 M14 10v9 M19 10v9 M3 21h18",bars:"M5 20v-6 M12 20V9 M19 20V4",income:"M3 19l6-6 4 3 8-10 M15 6h6v6",expense:"M3 5l6 6 4-3 8 10 M15 18h6v-6",personal:"M3 8v8 M6 5v14 M6 12h12 M18 5v14 M21 8v8",tennis:"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M5 5c7 4 7 10 0 14 M19 5c-7 4-7 10 0 14",kids:"M9 7a3 3 0 1 0 0 .1 M16 8a2 2 0 1 0 0 .1 M3 21v-5c0-5 11-5 11 0v5 M16 13c4 0 5 2 5 5v3",trophy:"M7 3h10v6c0 6-10 6-10 0V3z M7 5H3v3c0 4 4 4 4 4 M17 5h4v3c0 4-4 4-4 4 M12 14v6 M7 21h10",calendar:"M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16",check:"M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0 M7 12l3 3 7-7",clock:"M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0 M12 6v6l4 3",document:"M6 2h8l4 4v16H6z M14 2v5h4 M9 11h6 M9 15h6 M9 19h5",extra:"M3 5h14 M3 10h12 M3 15h8 M17 13v8 M13 17h8",dollar:"M12 2v20 M18 6c-3-4-12-2-12 2s12 3 12 7-9 6-12 2"};
function Icon({name}:{name:IconName}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;}
type Item={label:string;value:number;icon:IconName;tone:string;onClick?:()=>void};
function Tile({item}:{item:Item}){
 const body=<><span className={styles.summaryTileHead}><span className={styles.summaryIcon}><Icon name={item.icon}/></span>{item.onClick?<span aria-hidden="true">›</span>:null}</span><span className={styles.summaryTileLabel}>{item.label}</span><strong>{money.format(item.value)}</strong></>;
 const cls=`${styles.summaryTile} ${styles[item.tone]}`;
 return item.onClick?<button className={cls} onClick={item.onClick}>{body}</button>:<div className={cls}>{body}</div>;
}
function Group({title,description,icon,items,onOpen}:{title:string;description:string;icon:IconName;items:Item[];onOpen:()=>void}){
 return <section className={styles.summaryGroup}><header className={styles.summaryGroupHeader}><span className={`${styles.summaryIcon} ${styles[title==="Personal"?"summaryBlue":title==="DS Tênis"?"summaryOrange":"summaryRed"]}`}><Icon name={icon}/></span><div><h2>{title}</h2><p>{description}</p></div><button onClick={onOpen}>Ver detalhes <span aria-hidden="true">›</span></button></header><div className={`${styles.summaryTiles} ${items.length===5?styles.summaryFive:items.length===4?styles.summaryFour:styles.summaryThree}`}>{items.map(item=><Tile key={item.label} item={item}/>)}</div></section>;
}
export function FinanceSummaryView({summary:s,mercadoPagoBalance:mp,onOpen,onFilter}:{summary:ReturnType<typeof financeSummary>;mercadoPagoBalance:number|null;onOpen:(tab:Destination)=>void;onFilter:(filter:"ALL"|"PAID"|"OPEN",tab:"personal"|"expenses")=>void}){
 const expenses:Item[]=[{label:"Previstas",value:s.expensesExpected,icon:"document",tone:"summaryRed"},{label:"Pagas",value:s.plannedExpensesPaid,icon:"check",tone:"summaryGreen"},{label:"A pagar",value:s.payable,icon:"clock",tone:"summaryOrange"},{label:"Gastos extras do mês",value:s.extrasTotal,icon:"extra",tone:"summaryPurple"}];
 return <div className={styles.approvedSummary}>
   <div className={styles.summaryBalances}>
     <div className={`${styles.summaryBalance} ${styles.summaryBlue}`}><div><span className={styles.summaryIcon}><Icon name="wallet"/></span><span>Saldo projetado<br/>das contas</span></div><strong>{money.format(s.projectedResult)}</strong></div>
     <div className={`${styles.summaryBalance} ${styles.summaryGreen}`}><div><span className={styles.summaryIcon}><Icon name="bank"/></span><span>Saldo<br/>Mercado Pago</span></div><strong>{typeof mp==="number"?money.format(mp):"Aguardando saldo"}</strong></div>
     <div className={`${styles.summaryBalance} ${styles.summaryConsolidated}`}><div><span className={styles.summaryIcon}><Icon name="bars"/></span><span>Saldo projetado<br/>consolidado</span></div><strong>{typeof mp==="number"?money.format(s.projectedResult+mp):"Aguardando saldo MP"}</strong></div>
   </div>
   <div className={styles.summaryOverview}>
     <section className={`${styles.summaryOverviewCard} ${styles.summaryGreen}`}><header><span className={styles.summaryIcon}><Icon name="income"/></span><h2>Receitas</h2></header><div className={styles.summaryOverviewRows}>{[["Previstas",s.projectedRevenue,"ALL"],["Recebidas",s.realizedRevenue,"PAID"],["A receber",s.receivable,"OPEN"]].map(([label,value,filter])=><button key={label} onClick={()=>onFilter(filter as "ALL"|"PAID"|"OPEN","personal")}><span>{label}</span><strong>{money.format(value as number)}</strong><span aria-hidden="true">›</span></button>)}</div></section>
     <section className={`${styles.summaryOverviewCard} ${styles.summaryRed}`}><header><span className={styles.summaryIcon}><Icon name="expense"/></span><h2>Despesas</h2></header><div className={styles.summaryOverviewRows}>{expenses.map((item,i)=><button key={item.label} onClick={()=>i===3?onOpen("extras"):onFilter((["ALL","PAID","OPEN"] as const)[i],"expenses")}><span>{item.label}</span><strong>{money.format(item.value)}</strong><span aria-hidden="true">›</span></button>)}</div></section>
   </div>
   <Group title="Personal" description="Suas receitas de alunos de personal." icon="personal" onOpen={()=>onOpen("personal")} items={[{label:"Previsto",value:s.personalExpected,icon:"dollar",tone:"summaryGreen"},{label:"Recebido",value:s.personalReceived,icon:"check",tone:"summaryBlue"},{label:"A receber",value:s.personalOpen,icon:"clock",tone:"summaryOrange"}]}/>
   <Group title="DS Tênis" description="Receitas por categoria." icon="tennis" onOpen={()=>onOpen("ds")} items={[{label:"Kids líquido",value:s.kidsNet,icon:"kids",tone:"summaryGreen"},{label:"Ranking",value:s.ranking,icon:"trophy",tone:"summaryBlue"},{label:"Eventos",value:s.events,icon:"calendar",tone:"summaryPurple"},{label:"Recebido",value:s.dsReceived,icon:"check",tone:"summaryBlue"},{label:s.dsBalance>=0?"A receber":"A devolver",value:Math.abs(s.dsBalance),icon:"clock",tone:"summaryOrange"}]}/>
   <Group title="Despesas" description="Suas contas de despesas fixas e variáveis." icon="expense" onOpen={()=>onOpen("expenses")} items={expenses}/>
 </div>;
}
