type Props={settled:boolean;onHistory:()=>void;onRegister:()=>void;onPresence:()=>void;onAbsence:()=>void};
export default function HomeStudentActions({settled,onHistory,onRegister,onPresence,onAbsence}:Props) {
  return <span className="calendar-student-actions home-student-actions">
    <button type="button" className="secondary compact-action" onClick={onHistory}>Histórico</button>
    <button type="button" className="secondary compact-action" disabled={settled} onClick={onRegister}>Registrar</button>
    <button type="button" className="secondary compact-action" disabled={settled} onClick={onPresence}>Presença</button>
    <button type="button" className="absence-action compact-action" disabled={settled} onClick={onAbsence}>Ausência</button>
  </span>;
}
