const words:Record<string,number>={zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90,cem:100,cento:100,duzentos:200,trezentos:300,quatrocentos:400,quinhentos:500,seiscentos:600,setecentos:700,oitocentos:800,novecentos:900,mil:1000};
export function spokenNumbers(text:string):Set<number>{
 const result=new Set<number>();for(const match of text.matchAll(/\d+(?:[.,]\d+)?/g))result.add(Number(match[0].replace(',','.')));
 const tokens=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z]+/);let value:number|undefined;
 const flush=()=>{if(value!==undefined)result.add(value);value=undefined;};
 for(const token of tokens){if(token==='e')continue;const n=words[token];if(n===undefined){flush();continue;}if(value===undefined)value=n;else if(n===1000)value=(value||1)*1000;else if((value>=1000&&value%1000===0&&n<1000)||(value>=100&&value%100===0&&n<100)||(value%100>=20&&value%10===0&&n<10))value+=n;else{flush();value=n;}}flush();return result;
}
