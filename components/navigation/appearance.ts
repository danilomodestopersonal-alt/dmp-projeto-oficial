"use client";
import {useEffect,useState} from "react";
import {ROUND2_VISUAL_DEFAULT} from "./visual-default";
export function useSharedAppearance(){
 const [enabled,setEnabled]=useState(ROUND2_VISUAL_DEFAULT);
 useEffect(()=>{
  const choice=new URLSearchParams(window.location.search).get("visual2");
  try{if(choice==="anterior"||choice==="novo")localStorage.setItem("dmp_shared_visual_v2",choice);setEnabled(ROUND2_VISUAL_DEFAULT&&localStorage.getItem("dmp_shared_visual_v2")!=="anterior");}
  catch{setEnabled(ROUND2_VISUAL_DEFAULT&&choice!=="anterior");}
 },[]);
 return enabled;
}
