const money = new Intl.NumberFormat("pt-BR", {style:"currency",currency:"BRL"});
export function DsOpeningBalanceRow({balance,className}:{balance:number;className:string}) {
  const label = balance > 0 ? "Saldo anterior a receber" : balance < 0 ? "Saldo anterior a devolver" : "Saldo anterior";
  return <div className={className}><span>{label}</span><strong>{money.format(Math.abs(balance))}</strong></div>;
}
export function DsOpeningBalanceEditButton({editable,className,onEdit}:{editable:boolean;className:string;onEdit:()=>void}) {
  return <button type="button" className={className} disabled={!editable} onClick={onEdit}>Editar saldo anterior da DS</button>;
}
