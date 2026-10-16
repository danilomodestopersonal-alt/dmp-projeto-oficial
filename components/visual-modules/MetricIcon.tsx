"use client";
import {createContext,useContext} from 'react';
import HomeIcon from '../home/HomeIcon';
export const ModuleVisualContext=createContext(false);
const names:Record<string,string>={'👥':'students','📁':'data','🏋️':'workouts-overview','📊':'reports','📏':'assessments-overview','✅':'reports'};
export default function MetricIcon({icon}:{icon:string}){const enabled=useContext(ModuleVisualContext);return enabled&&names[icon]?<HomeIcon name={names[icon]}/>:<>{icon}</>}
