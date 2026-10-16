// Reversao exclusivamente visual, independente por area.
export const MODULE_VISUAL_DEFAULTS = {
  financeiro: true, alunos: true, treinos: true, agenda: true,
  avaliacoes: true, performance: true, kids: true, relatorios: true, dados: true,
} as const;
export type VisualModule = keyof typeof MODULE_VISUAL_DEFAULTS;
export function moduleFor(view:string,tab:string):VisualModule|null {
 if(view==='today'||view==='weather')return null;
 if(view==='student')return tab==='assessments'?'avaliacoes':tab==='finance'?'financeiro':tab==='workouts'||tab==='history'?'treinos':'alunos';
 if(view==='finance')return 'financeiro';
 if(view==='students')return 'alunos';
 if(view==='assessments-overview')return 'avaliacoes';
 if(view==='reports')return 'relatorios';
 if(view==='data'||view==='settings')return 'dados';
 if(view==='agenda'||view==='performance'||view==='kids')return view;
 return ['workouts-overview','history-overview','workout-editor','planned-session','historical-workout','free-session','attendance-session'].includes(view)?'treinos':null;
}
export function visualEnabled(module:VisualModule,globalChoice:string|null,localChoice:string|null){
 return MODULE_VISUAL_DEFAULTS[module] && (localChoice ?? globalChoice)!=='anterior';
}
