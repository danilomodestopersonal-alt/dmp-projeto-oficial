"use client";
import {useEffect,useState} from "react";
import {HOME_APPEARANCE_DEFAULT} from "./appearance-default";
const KEY="dmp_home_appearance_v1";
export function useHomeAppearance(){
  const [modern,setModern]=useState(HOME_APPEARANCE_DEFAULT);
  useEffect(()=>{
    const choice=new URLSearchParams(window.location.search).get("aparencia");
    try{
      if(choice==="anterior"||choice==="nova")localStorage.setItem(KEY,choice);
      const saved=localStorage.getItem(KEY);
      setModern(HOME_APPEARANCE_DEFAULT && saved!=="anterior");
    }catch{setModern(HOME_APPEARANCE_DEFAULT && choice!=="anterior");}
  },[]);
  return modern;
}
