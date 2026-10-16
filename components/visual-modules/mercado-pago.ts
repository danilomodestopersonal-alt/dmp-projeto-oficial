import s from '../mercado-pago/MercadoPagoTestPage.module.css';
import {rule,classes,media} from './css';
const r=(n:string[],v:string)=>rule('financeiro',classes(s,...n),v);
export const mercadoPagoCss=[
 r(['page'],'font-family:DMPHomeInter,Inter,Arial,sans-serif;gap:16px!important'),
 r(['balanceHero'],'border-radius:16px!important;padding:20px!important;background:#194c40!important'),
 r(['statement','flow','reconcileBox','learningStrip','learnedRules'],'border:1px solid #d6e1d9!important;border-radius:14px!important;box-shadow:none!important;padding:18px!important'),
 r(['move'],'padding:14px!important;gap:12px!important;border-radius:10px!important'),
 r(['info'],'min-width:0!important;line-height:1.5'),
 rule('financeiro',classes(s,'info').map(x=>x+' small'),'font-size:13px!important;color:#52665b!important'),
 rule('financeiro',classes(s,'toolbar','syncButtons','reconcileBox').map(x=>x+' button'),'font-size:14px!important;min-height:42px!important;border-radius:9px!important'),
 rule('financeiro',classes(s,'reconcileBox').flatMap(x=>[x+' input:not([type=checkbox]):not([type=radio])',x+' select']),'font-size:14px!important;min-height:42px!important;border-radius:9px!important;max-width:100%!important;box-sizing:border-box'),
 media(800,r(['grid','reconcileGrid'],'grid-template-columns:minmax(0,1fr)!important')+r(['toolbar','syncButtons'],'flex-wrap:wrap!important;gap:8px!important')+r(['move'],'grid-template-columns:auto minmax(0,1fr)!important')+r(['side'],'grid-column:1/-1!important;justify-content:flex-end!important')),
].join('\n');
