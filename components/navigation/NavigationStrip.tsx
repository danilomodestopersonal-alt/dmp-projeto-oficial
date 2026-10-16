"use client";
import {useEffect,useRef,type ReactNode} from "react";
export default function NavigationStrip({enabled,current,children}:{enabled:boolean;current:string;children:ReactNode}){
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{
  if(!enabled)return;
  const nav=ref.current;if(!nav)return;
  const update=()=>{nav.dataset.more=nav.scrollWidth>nav.clientWidth+nav.scrollLeft+2?"true":"false";};
  const active=nav.querySelector<HTMLElement>('.active');
  if(active&&nav.scrollWidth>nav.clientWidth){const a=active.getBoundingClientRect(),n=nav.getBoundingClientRect();if(a.left<n.left||a.right>n.right)nav.scrollLeft+=a.left<n.left?a.left-n.left:a.right-n.right;}
  update();nav.addEventListener('scroll',update,{passive:true});
  const resize=new ResizeObserver(update);resize.observe(nav);
  return()=>{nav.removeEventListener('scroll',update);resize.disconnect();delete nav.dataset.more;};
 },[enabled,current]);
 return <nav ref={ref} className="dashboard-nav" aria-label="Menu principal" title={enabled?"No celular, deslize o menu para ver todas as opções":undefined}>{children}</nav>;
}
