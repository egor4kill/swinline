/* UI. Исходы и кошелёк считает сервер SWINLINE; клиент только рисует. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),C=SLOT_CONFIG,E=SlotEngine;
 let engine=new E.Engine(E.fresh()),busy=false,auto=0,turbo=false,lastWin=0,ready=false;
 engine.state.balance=0;engine.state.bet=1000;engine.state.currency='sv';
 let visualBalance=0,displayBonus=false,svBalance=0,arBalance=0;
 window.desiredBonus=false;
 const A=gameAudio,M=gameMotion;
 const parentWindow=window.parent!==window?window.parent:null;
 let B=parentWindow&&parentWindow.__SWINLINE_OLYMPUS__?parentWindow.__SWINLINE_OLYMPUS__:null;
 const SYMBOL_BY_ID={1:'crown',2:'hourglass',3:'ring',4:'cup',5:'red',6:'purple',7:'yellow',8:'green',9:'blue',10:'scatter',11:'orb'};
 const money=n=>(n/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
 const credits=n=>Math.round(Number(n||0)*100);
 const unit=()=>engine.state.currency==='ar'?'АР':'SV₽';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const delay=ms=>new Promise(r=>setTimeout(r,reduced?0:(turbo?ms*.2:ms)));
 function save(){}
 const symbols=Object.fromEntries(C.symbols.map(s=>[s.id,s]));
 function mapResult(d){
   const steps=Array.isArray(d.steps)?d.steps.map(st=>{
     const grid=Array.isArray(st.grid)?st.grid:[];
     const wins=Array.isArray(st.wins)?st.wins:[];
     return {
       board:grid.map(c=>({id:SYMBOL_BY_ID[Number(c.s)]||'blue',m:Number(c.m)||0})),
       wins:wins.map(w=>({
         id:SYMBOL_BY_ID[Number(w.s)]||'blue',
         count:Number(w.count)||0,
         indices:Array.isArray(w.indices)?w.indices.map(Number):[],
         amount:credits(w.amount)
       }))
     };
   }):[];
   return {
     steps,
     base:credits(d.base),
     win:credits(d.win),
     scatterWin:credits(d.scatter_win),
     orbSum:Number(d.orb_sum)||0,
     multiplier:Number(d.multiplier)||1,
     nextMultiplier:Number(d.next_multiplier)||0,
     awarded:Number(d.awarded)||0,
     isFree:!!d.is_free,
     capped:!!d.capped,
     bonusEnded:!!d.bonus_ended
   };
 }
 let authTimer=null,gateRetry=false;
 function showGate(title,text,canLogin){
   gateRetry=!canLogin;
   $('gate-title').textContent=title;$('gate-text').textContent=text;
   $('gate-login').textContent=canLogin?'Войти через Twitch':'Повторить';
   $('gate-login').hidden=!canLogin&&!B;
   $('gate-link').hidden=!!B;
   $('gate').hidden=false;
 }
 function hideGate(){$('gate').hidden=true;}
 function stopAuthPoll(){if(authTimer){clearInterval(authTimer);authTimer=null;}}
 function startAuthPoll(){
   stopAuthPoll();
   authTimer=setInterval(async()=>{
     if(!B)return;
     const r=await B.rpc('olympus_state',{});
     if(r.data&&r.data.authed){stopAuthPoll();await syncState();}
   },1800);
 }
 async function syncState(showToast=false){
   if(!B){showGate('Олимп доступен на SWINLINE','Игра использует баланс SV₽ и АР. Откройте её на сайте.',false);return false;}
   try{
     const resp=await B.rpc('olympus_state',{});
     if(resp.error)throw new Error(resp.error.message||'Сервер недоступен');
     const d=resp.data;
     if(!d||!d.authed){
       ready=false;
       showGate('Войдите через Twitch','Баланс SV₽ и АР привязан к аккаунту SWINLINE. Войдите, чтобы играть.',true);
       startAuthPoll();ui();return false;
     }
     stopAuthPoll();hideGate();
     svBalance=Number(d.sv_bal)||0;arBalance=Number(d.ar_bal)||0;
     const serverCur=d.currency==='ar'?'ar':'sv';
     const preferred=B.initialCurrency==='ar'?'ar':'sv';
     const cur=!Number(d.free)&&preferred!==serverCur?preferred:serverCur;
     engine.state.currency=cur;
     engine.state.bet=cur===serverCur
       ?(credits(d.bet)||(cur==='ar'?100:1000))
       :(cur==='ar'?100:1000);
     engine.state.free=Number(d.free)||0;
     engine.state.bonusMultiplier=Number(d.bonus_multiplier)||0;
     engine.state.roundWin=credits(d.round_win);
     engine.state.bonusWin=credits(d.bonus_win);
     engine.state.balance=credits(engine.state.currency==='ar'?arBalance:svBalance);
     if(!engine.state.board)engine.state.board=E.newBoard(engine.rng);
     visualBalance=engine.state.balance;
     displayBonus=engine.state.free>0;window.desiredBonus=displayBonus;
     window.setBonusScene?.(displayBonus);
     ready=true;renderBets();renderBoard(engine.state.board);ui();
     if(B.onCurrency)B.onCurrency(engine.state.currency);
     if(B.onBalance)B.onBalance(engine.state.currency,engine.state.balance/100);
     if(showToast)message('Баланс обновлён');
     return true;
   }catch(e){
     ready=false;
     showGate('Не удалось подключиться','Проверьте соединение и попробуйте ещё раз.',false);
     message(e.message);ui();return false;
   }
 }
 async function waitForBridge(){
   for(let i=0;i<50;i++){
     if(parentWindow&&parentWindow.__SWINLINE_OLYMPUS__){B=parentWindow.__SWINLINE_OLYMPUS__;return true;}
     await new Promise(r=>setTimeout(r,100));
   }
   return false;
 }
 function renderBoard(board,winning=[]){
   M.render(board);
   const counts={};for(const cell of board)counts[cell.id]=(counts[cell.id]||0)+1;
   $('board').setAttribute('aria-label',Object.entries(counts).map(([id,n])=>`${symbols[id].name}: ${n}`).join(', '));
 }
 function ui(){
   const s=engine.state;
   $('balance').textContent=money(visualBalance);$('win').textContent=money(lastWin);$('buy-price').textContent=money(s.bet*C.bonusCost);
   $('balance-unit').textContent=unit();$('buy-unit').textContent=unit();
   $('currency').value=s.currency;
   $('bet').value=s.bet;$('mode').textContent=displayBonus?'БОНУСНАЯ ИГРА':'ОСНОВНАЯ ИГРА';
   $('free-counter').textContent=displayBonus?`Фриспинов: ${s.free}`:'';
   $('stage').classList.toggle('bonus',displayBonus);
   $('bonus-total').textContent=s.free?`В бонусе: ${money(s.bonusWin)} ${unit()}`:'за последнее вращение';
   if(!busy){$('multiplier').textContent='×'+(s.free?s.bonusMultiplier||1:1);$('multiplier-note').textContent=s.free?'Копится в бонусной игре':'В выигрышном каскаде';}
   $('spin').disabled=!ready||busy||(!s.free&&s.balance<s.bet);
   $('buy').disabled=!ready||busy||!!s.free||s.balance<s.bet*C.bonusCost||auto>0;
   for(const id of ['bet','plus','minus','currency'])$(id).disabled=!ready||busy||!!s.free||auto>0;
   $('refill').disabled=!ready||busy||auto>0;
   $('auto').disabled=!ready;
   $('auto').textContent=auto>0?`Стоп · ${auto}`:'Авто · 25';$('auto').setAttribute('aria-pressed',String(auto>0));
 }
 function message(text){$('status').textContent=text;}
 async function celebrate(title,value,numeric=null){
   A.duck(2.5);A.play('bigwin',.65);window.sceneCelebrate?.();
   $('celebration-title').textContent=title;$('celebration-value').textContent=value;$('celebration').hidden=false;
   M.coins(40);await M.animate($('celebration'),[{opacity:0},{opacity:1}],250);
   await M.animate($('celebration').firstElementChild,[{transform:'translateY(20px) scale(.92)',opacity:0},{transform:'translateY(0) scale(1)',opacity:1}],450);
   if(numeric!==null)await M.count($('celebration-value'),numeric,money,1200);
   await delay(1200);await M.animate($('celebration'),[{opacity:1},{opacity:0}],250);$('celebration').hidden=true;A.play('bigwinEnd',.4);
 }
 async function spin(){
   if(busy||!ready)return;
   busy=true;lastWin=0;M.setFast(turbo);ui();message('Запрос к серверу…');
   let r;
   try{
     const resp=await B.rpc('olympus_play',{p_stake:engine.state.bet/100,p_currency:engine.state.currency});
     if(resp.error)throw new Error(resp.error.message||'Сервер недоступен');
     const d=resp.data;if(!d)throw new Error('Сервер не вернул результат');
     r=mapResult(d);
     engine.state.currency=d.currency==='ar'?'ar':'sv';
     engine.state.bet=credits(d.bet)||engine.state.bet;
     engine.state.balance=credits(d.bal);
     engine.state.free=Number(d.free)||0;
     engine.state.bonusMultiplier=Number(d.bonus_multiplier)||0;
     engine.state.roundWin=credits(d.round_win);
     engine.state.bonusWin=credits(d.bonus_win);
     if(r.steps.length)engine.state.board=r.steps[r.steps.length-1].board;
     if(engine.state.currency==='ar')arBalance=Number(d.bal)||0;else svBalance=Number(d.bal)||0;
     visualBalance=engine.state.balance;
     if(r.isFree)displayBonus=true;
     engine.state.stats.won+=r.win;
     engine.state.stats.paid+=r.isFree?0:1;
     engine.state.stats.free+=r.isFree?1:0;
     engine.state.stats.wagered+=r.isFree?0:credits(d.cost);
     engine.state.history.unshift({n:engine.state.stats.paid+engine.state.stats.free,free:r.isFree,bet:engine.state.bet,win:r.win,tumbles:Math.max(0,r.steps.length-1),multiplier:r.multiplier});
     engine.state.history=engine.state.history.slice(0,30);
     if(B.onBalance)B.onBalance(engine.state.currency,Number(d.bal)||0);
   }catch(e){
     busy=false;auto=0;message(e.message);ui();return;
   }
   ui();message(r.isFree?'Фриспин…':'Вращение…');
   try{
     await M.enter(r.steps[0].board);
     let tumbleWin=0;
     for(let i=0;i<r.steps.length;i++){
       const step=r.steps[i];
       if(!step.wins.length)break;
       tumbleWin+=step.wins.reduce((s,w)=>s+w.amount,0);
       const indices=step.wins.flatMap(w=>w.indices);
       message(`Каскад ${i+1} · ${step.wins.map(w=>`${w.count} × ${symbols[w.id].name}`).join(' · ')} · ${money(tumbleWin)}`);
       await M.highlight(indices,i);
       for(const w of step.wins)M.floating($('board').children[w.indices[Math.floor(w.indices.length/2)]],'+'+money(w.amount));
       await M.count($('win'),tumbleWin,money,400);
       await M.cascade(r.steps[i+1].board,indices,i);
     }
     $('multiplier').textContent='×'+(r.isFree?r.nextMultiplier||1:r.orbSum||1);
     if(r.base>0&&r.orbSum>0){message(`${money(r.base)} × ${r.multiplier} = ${money(r.base*r.multiplier)}`);await M.collect(r.steps[r.steps.length-1].board,$('multiplier'));A.play('total',.7);}
     lastWin=r.win;await M.count($('win'),r.win,money,650);
     if(r.capped){await celebrate('Достигнут лимит раунда','15 000×');if(displayBonus){await M.transition(false);displayBonus=false;window.desiredBonus=false;}}
     else if(r.awarded&&!r.isFree){A.play('bonusTrigger',.7);await M.transition(true);displayBonus=true;window.desiredBonus=true;await celebrate('БОНУСНАЯ ИГРА',`+${r.awarded} фриспинов`);}
     else if(r.awarded){await celebrate('ПРОДОЛЖАЕМ',`+${r.awarded} фриспинов`);}
     else if(r.bonusEnded){await celebrate('БОНУС ЗАВЕРШЁН',money(engine.state.bonusWin),engine.state.bonusWin);await M.transition(false);displayBonus=false;window.desiredBonus=false;}
     else if(r.win>=engine.state.bet*20){await celebrate('БОЛЬШОЙ ВЫИГРЫШ',money(r.win),r.win);}
     if(r.capped)message('Лимит 15 000× достигнут. Раунд завершён.');
     else if(r.awarded)message(`Добавлено ${r.awarded} фриспинов. Нажмите «Крутить» или включите авто.`);
     else if(r.bonusEnded)message(`Бонус завершён · выплачено ${money(engine.state.bonusWin)}`);
     else message(r.win?`Выигрыш ${money(r.win)} ${unit()}`:'Без выигрыша. Следующее вращение независимо от предыдущего.');
   }catch(e){auto=0;renderBoard(engine.state.board);message('Результат сохранён. Ошибка анимации: '+e.message);}
   finally{A.spinStop();window.clearSymbolWins?.();$('stage').classList.remove('spinning');visualBalance=engine.state.balance;busy=false;ui();}
   if(auto>0){auto--;ui();if(auto>0){await delay(450);if(auto>0)spin();}}
 }
 function allowedBets(){
   const s=engine.state;
   return C.bets.filter(b=>s.currency==='ar'?b>=100:b>=1000);
 }
 function renderBets(){
   const sel=$('bet'),list=allowedBets();
   sel.innerHTML='';
   for(const bet of list){const option=document.createElement('option');option.value=bet;option.textContent=money(bet);sel.append(option);}
   if(!list.includes(engine.state.bet))engine.state.bet=list[0]||(engine.state.currency==='ar'?100:1000);
   sel.value=engine.state.bet;
 }
 $('spin').onclick=spin;
 document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!$('dialog').open&&!['BUTTON','SELECT','INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();spin();}});
 function changeBet(bet){try{engine.setBet(bet);save();ui();}catch(e){message(e.message);}}
 $('bet').onchange=e=>changeBet(Number(e.target.value));
 $('minus').onclick=()=>{const list=allowedBets();changeBet(list[Math.max(0,list.indexOf(engine.state.bet)-1)]);};
 $('plus').onclick=()=>{const list=allowedBets();changeBet(list[Math.min(list.length-1,list.indexOf(engine.state.bet)+1)]);};
 $('currency').onchange=e=>{
   const cur=e.target.value==='ar'?'ar':'sv';
   if(busy||!ready||engine.state.free){
     e.target.value=engine.state.currency;
     if(engine.state.free)message('Валюта зафиксирована до конца бонуса');
     return;
   }
   engine.state.currency=cur;
   engine.state.bet=cur==='ar'?100:1000;
   engine.state.roundWin=0;engine.state.bonusWin=0;engine.state.bonusMultiplier=0;
   engine.state.balance=credits(cur==='ar'?arBalance:svBalance);
   visualBalance=engine.state.balance;
   renderBets();ui();
   if(B&&B.onCurrency)B.onCurrency(cur);
   message(cur==='ar'?'Игра на АР':'Игра на SV₽');
 };
 $('turbo').onclick=()=>{turbo=!turbo;$('turbo').textContent='Турбо: '+(turbo?'вкл.':'выкл.');$('turbo').setAttribute('aria-pressed',String(turbo));};
 function audioUI(){const s=A.state;$('sound').textContent='Звук: '+(s.enabled?'вкл.':'выкл.');$('sound').setAttribute('aria-pressed',String(s.enabled));$('music').textContent='Музыка: '+(s.music?'вкл.':'выкл.');$('music').setAttribute('aria-pressed',String(s.music));$('volume').value=Math.round(s.volume*100);}
 $('sound').onclick=()=>{A.toggle();A.unlock().catch(()=>{});audioUI();};
 $('music').onclick=()=>{A.toggleMusic();A.unlock().catch(()=>{});audioUI();};
 $('volume').oninput=e=>A.volume(Number(e.target.value)/100);
 document.addEventListener('pointerdown',()=>{A.unlock().catch(()=>{});},{once:true});
 document.addEventListener('keydown',()=>{A.unlock().catch(()=>{});},{once:true});
 audioUI();
 $('auto').onclick=()=>{if(auto){auto=0;ui();}else{auto=25;ui();if(!busy)spin();}};
 function modal(title,html){$('dialog-title').textContent=title;$('dialog-body').innerHTML=html;$('dialog').showModal();}
 $('close-dialog').onclick=()=>$('dialog').close();
 $('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}});
 $('buy').onclick=()=>{
   if(busy||!ready||engine.state.free)return;
   modal('Купить 15 фриспинов',`<p>Стоимость: <b>${money(engine.state.bet*C.bonusCost)}</b> ${unit()} (100× ставки). Ставка ${money(engine.state.bet)} ${unit()} фиксируется до конца бонуса.</p><p>Множители на выигрышных вращениях накапливаются. Три скаттера добавляют 5 фриспинов. Выигрыш не гарантирован.</p><div class="dialog-actions"><button id="cancel-buy">Отмена</button><button id="confirm-buy">Купить фриспины</button></div>`);
   $('cancel-buy').onclick=()=>$('dialog').close();
   $('confirm-buy').onclick=async()=>{
     if(busy)return;
     busy=true;
     try{
       const resp=await B.rpc('olympus_buy',{p_stake:engine.state.bet/100,p_currency:engine.state.currency});
       if(resp.error)throw new Error(resp.error.message||'Сервер недоступен');
       const d=resp.data;if(!d)throw new Error('Сервер не вернул результат');
       engine.state.currency=d.currency==='ar'?'ar':'sv';
       engine.state.bet=credits(d.bet)||engine.state.bet;
       engine.state.balance=credits(d.bal);
       engine.state.free=Number(d.free)||15;
       engine.state.bonusMultiplier=0;engine.state.roundWin=0;engine.state.bonusWin=0;
       if(engine.state.currency==='ar')arBalance=Number(d.bal)||0;else svBalance=Number(d.bal)||0;
       engine.state.stats.bought+=1;
       engine.state.stats.wagered+=credits(d.cost);
       visualBalance=engine.state.balance;lastWin=0;auto=0;
       if(B.onBalance)B.onBalance(engine.state.currency,Number(d.bal)||0);
       $('dialog').close();M.setFast(turbo);ui();A.play('bonusTrigger',.7);await M.transition(true);displayBonus=true;window.desiredBonus=true;await celebrate('БОНУСНАЯ ИГРА','15 ФРИСПИНОВ');message('15 фриспинов готовы. Нажмите «Крутить».');
     }catch(e){message(e.message);$('dialog').close();}
     finally{busy=false;ui();}
   };
 };
 $('rules').onclick=()=>{
   const rows=C.symbols.filter(s=>s.pays).map(s=>`<tr><td><img src="assets/${s.id}.png" alt="">${s.name}</td>${s.pays.map(x=>`<td>${x}×</td>`).join('')}</tr>`).join('');
   modal('Правила и выплаты',`<p class="callout">Это игра SWINLINE. Вероятности оригинала не воспроизведены. Ставки и выплаты — в SV₽ или АР; реальных денег нет.</p><p>Поле 6 × 5. От 8 одинаковых символов в любом месте поля дают выплату. Выигрышные символы исчезают, остальные падают вниз. За каскад не списывается новая ставка.</p><table><thead><tr><th>Символ</th><th>8–9</th><th>10–11</th><th>12+</th></tr></thead><tbody>${rows}</tbody></table><p>Выплаты указаны в множителях ставки. Шары от 2× до 1000× суммируются и умножают общий выигрыш каскадов один раз. В бонусе сумма накапливается между вращениями; применяется только на выигрышном вращении с новым шаром.</p><p>4 / 5 / 6+ скаттеров в конце базового вращения платят 3× / 5× / 100× и дают 15 фриспинов. В бонусе 3+ скаттера добавляют 5 фриспинов. Покупка за 100× сразу даёт 15 фриспинов, без выплаты за скаттеры. Лимит всего раунда вместе с бонусом: 15 000× ставки.</p><p>Результаты независимы от баланса и истории. Веса символов открыты в config.js. Баланс хранится на сервере SWINLINE. Пробел — вращение. Используются оригинальные звуки и музыка. Музыка включается после первого нажатия; её можно отключить отдельно.</p>`);
 };
 $('history').onclick=()=>{
   const s=engine.state;
   modal('История сессии',`<p>Списано: ${money(s.stats.wagered)} · Выплачено: ${money(s.stats.won)} · Покупок бонуса: ${s.stats.bought}</p><table><thead><tr><th>Ход</th><th>Режим</th><th>Каскады</th><th>Выигрыш</th></tr></thead><tbody>${s.history.map(h=>`<tr><td>${h.n}</td><td>${h.free?'Фриспин':'База'}</td><td>${h.tumbles}</td><td>${money(h.win)}</td></tr>`).join('')||'<tr><td colspan="4">Вращений ещё нет.</td></tr>'}</tbody></table>`);
 };
 $('refill').onclick=()=>{
   if(busy)return;
   syncState(true);
 };
 $('gate-login').onclick=()=>{
   if(gateRetry){syncState();return;}
   if(B&&B.onNeedAuth)B.onNeedAuth();
 };
 if(!engine.state.board)engine.state.board=E.newBoard(engine.rng);
 renderBets();renderBoard(engine.state.board);ui();
 startScene($('scene')).catch(e=>{console.error('Scene:',e);message('Игра готова. Анимация фона недоступна: '+e.message);});
 (async()=>{
   if(await waitForBridge())await syncState();
   else{
     ready=false;
     showGate('Олимп доступен на SWINLINE','Игра использует баланс SV₽ и АР. Откройте её на сайте.',false);
     ui();
   }
 })();
})();
