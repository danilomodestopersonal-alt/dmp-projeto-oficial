import type {VisualModule} from './defaults';
export function rule(module:VisualModule,selectors:string[],declarations:string){
 return selectors.map(s=>`[data-dmp-module="${module}"] ${s}`).join(',')+'{'+declarations+'}';
}
export function classes(styles:Record<string,string>,...names:string[]){
 return names.map(name=>{if(!styles[name])throw new Error('Classe visual inexistente: '+name);return '.'+styles[name];});
}
export const media=(width:number,css:string)=>`@media(max-width:${width}px){${css}}`;
