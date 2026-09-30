type Props={settled:boolean;onHistory:()=>void;onRegister:()=>void;onPresence:()=>void;onAbsence:()=>void};
export default function HomeStudentActions({settled,onHistory,onRegister,onPresence,onAbsence}:Props) {
  if (settled) return null;
  return <>
    <button type="button" className="secondary compact-action home-workouts-open" onClick={onHistory} title="Abrir histórico do aluno">Histórico</button>
    <span className="calendar-student-actions">
      <button type="button" className="secondary compact-action" onClick={onRegister}>Registrar</button>
      <button type="button" className="secondary compact-action" onClick={onPresence}>Presença</button>
      <button type="button" className="absence-action compact-action" onClick={onAbsence}>Ausência</button>
    </span>
  </>;
}
