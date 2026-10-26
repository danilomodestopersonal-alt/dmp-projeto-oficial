export type HolidayConfig={national:boolean;state:boolean;city:boolean};
export type PersonalHoliday={id:string;date:string;name:string;scope:"national"|"state"|"city";source:string};
export const defaultHolidayConfig:HolidayConfig={national:true,state:true,city:true};
export const holidaySources={national:"https://www.planalto.gov.br/ccivil_03/leis/l0662.htm",aparecida:"https://www.planalto.gov.br/ccivil_03/leis/l6802.htm",consciencia:"https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm",state:"https://www.al.sp.gov.br/repositorio/legislacao/lei/1997/lei-9497-05.03.1997.html",city:"https://www.valinhos.sp.gov.br/portal/secretarias-paginas/143/feriados-municipaisnacionais/",calendar2026:"https://www.valinhos.sp.gov.br/portal/leis_decretos/19648/"};
// Only holidays, never public-service optional days. Calendar configuration
// selects sources; it never authorizes a Google mutation.
export function personalHolidays(year:number,config:HolidayConfig=defaultHolidayConfig):PersonalHoliday[]{
 if(!Number.isInteger(year)||year<2026||year>2030)throw Error("Escolha um ano entre 2026 e 2030.");
 const all:PersonalHoliday[]=[];
 const add=(monthDay:string,name:string,scope:PersonalHoliday["scope"],source:string)=>all.push({id:scope+":"+year+"-"+monthDay,date:year+"-"+monthDay,name,scope,source});
 for(const [date,name] of [["01-01","Confraternização Universal"],["04-21","Tiradentes"],["05-01","Dia do Trabalho"],["09-07","Independência do Brasil"],["11-02","Finados"],["11-15","Proclamação da República"],["12-25","Natal"]])add(date,name,"national",holidaySources.national);
 add("10-12","Nossa Senhora Aparecida","national",holidaySources.aparecida);
 add("11-20","Dia de Zumbi e da Consciência Negra","national",holidaySources.consciencia);
 add("07-09","Revolução Constitucionalista","state",holidaySources.state);
 add("01-20","São Sebastião","city",holidaySources.city);
 add("05-28","Aniversário de Valinhos","city",holidaySources.city);
 // Gregorian Easter; movable holidays are municipal in Valinhos.
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;
 const easter=Date.UTC(year,Math.floor(n/31)-1,n%31+1);
 for(const [offset,name] of [[-2,"Sexta-feira Santa"],[60,"Corpus Christi"]] as const)add(new Date(easter+offset*86400000).toISOString().slice(5,10),name,"city",holidaySources.city);
 return all.filter(h=>config[h.scope]).sort((a,b)=>a.date.localeCompare(b.date));
}
