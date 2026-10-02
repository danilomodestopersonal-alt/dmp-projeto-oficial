export const MAIN_VIEWS = ["today","students","workouts-overview","history-overview","assessments-overview","agenda","finance","reports","kids","performance","data","settings","weather","student"] as const;
export function restoredNavigation(state:unknown, home=false) {
  const s=state as Record<string,unknown>|null;
  if(home||!s?.dmpNav||!MAIN_VIEWS.includes(s.view as typeof MAIN_VIEWS[number]))return null;
  const tabs=["summary","timeline","workouts","history","assessments","finance","files"];
  const view=String(s.view);
  const studentId=typeof s.selectedStudentId==="string"?s.selectedStudentId:null;
  if(view==="student"&&!studentId)return null;
  return {view,tab:tabs.includes(String(s.tab))?String(s.tab):"summary",selectedStudentId:studentId};
}
export function moveDraftExercise<T>(items:T[],index:number,direction:number):T[]{
  const target=index+direction;if(index<0||target<0||index>=items.length||target>=items.length)return items;
  const next=[...items];[next[index],next[target]]=[next[target],next[index]];return next;
}

// Preserve contiguous sequences when a draft is reordered across other groups.
export function draftExercisesForReuse<T extends {block?:string}>(items:T[]):T[]{
  const seen=new Map<string,number>();
  const result:T[]=[];
  for(let index=0;index<items.length;){
    const label=items[index].block?.trim()||"Individual";
    let end=index+1;
    if(label!=="Individual")while(end<items.length&&items[end].block?.trim()===label)end++;
    const size=end-index;
    const part=(seen.get(label)||0)+1;seen.set(label,part);
    const typed=size===2?label.replace(/^tri-set/i,"Bi-set"):size===3?label.replace(/^bi-set/i,"Tri-set"):label;
    const block=size===1?`Individual ${index+1}`:typed+(part>1?` · sequência ${part}`:"");
    for(let i=index;i<end;i++)result.push({...items[i],block});
    index=end;
  }
  return result;
}
