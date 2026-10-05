export function bindReplacementModalBack(onClose:()=>void,host:Window=window){
  const marker=`kids-replacement-${Date.now()}-${Math.random()}`;
  const initial=host.history.state;
  let active=true;
  host.history.pushState({...host.history.state,dmpReplacementModal:marker},"",host.location.href);
  const onPop=(event:PopStateEvent)=>{
    if(!active)return;
    active=false;
    event.stopImmediatePropagation();
    onClose();
  };
  host.addEventListener("popstate",onPop,true);
  return ()=>{
    host.removeEventListener("popstate",onPop,true);
    if(active&&host.history.state?.dmpReplacementModal===marker){
      active=false;
      const current=host.history.state;
      if(current?.view===initial?.view&&current?.tab===initial?.tab&&current?.selectedStudentId===initial?.selectedStudentId){
        host.history.back();
      }else{
        // Abrir o cadastro do aluno já navegou: não desfaz essa navegação.
        const {dmpReplacementModal:_,...rest}=current;
        host.history.replaceState(rest,"",host.location.href);
      }
    }
  };
}
