import {EVENTS,MINBET} from './data'
export function r2(x){return Math.round(x*100)/100}
export function payout(stake,odds){return r2(stake*odds)}
export function validateStake(stake,balance){
 if(!isFinite(stake)||stake<=0)return 'Введи сумму больше нуля';
 if(stake<MINBET)return 'Минимальная ставка: '+MINBET+' SV₽';
 if(stake>balance)return 'Недостаточно SV₽ на балансе';
 return ''}
export function placeBet(s,evId,i,stake){
 var ev=EVENTS.find(function(e){return e.id===evId});
 if((s.st[evId]||{s:'open'}).s!=='open')return {err:'Приём ставок закрыт'};
 var e=validateStake(stake,s.bal);if(e)return {err:e};
 s.bal=r2(s.bal-stake);
 var b={id:'b'+Date.now()+Math.random().toString(36).slice(2,6),ev:evId,i:i,stake:stake,odds:ev.out[i][1],state:'open'};
 s.bets.unshift(b);s.log.unshift({t:Date.now(),x:'Ставка: '+ev.title+' ('+ev.out[i][0]+')',d:-stake});
 return {ok:b}}
export function settleEvent(s,evId,win){
 var ev=EVENTS.find(function(e){return e.id===evId});s.st[evId]={s:'done',w:win};
 s.bets.forEach(function(b){if(b.ev!==evId||b.state!=='open')return;
  if(b.i===win){var p=payout(b.stake,b.odds);s.bal=r2(s.bal+p);b.state='won';s.log.unshift({t:Date.now(),x:'Выигрыш: '+ev.title,d:p})}
  else{b.state='lost';s.log.unshift({t:Date.now(),x:'Проигрыш: '+ev.title,d:0})}})}
export function cancelEvent(s,evId){
 var ev=EVENTS.find(function(e){return e.id===evId});s.st[evId]={s:'cancel'};
 s.bets.forEach(function(b){if(b.ev!==evId||b.state!=='open')return;
  s.bal=r2(s.bal+b.stake);b.state='refund';s.log.unshift({t:Date.now(),x:'Возврат (событие отменено): '+ev.title,d:b.stake})})}

