(function(root){
  'use strict';
  const C = typeof module!=='undefined'?require('./config.js'):root.SLOT_CONFIG;
  function seeded(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
  function secureRandom(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}
  function weighted(items,rng,weight=x=>x.weight){let n=rng()*items.reduce((s,x)=>s+weight(x),0);for(const x of items){n-=weight(x);if(n<0)return x;}return items[items.length-1];}
  function makeCell(rng,isFree=false){const symbol=weighted(C.symbols,rng,x=>isFree&&x.id==='orb'?C.freeOrbWeight:x.weight);return {id:symbol.id,m:symbol.id==='orb'?weighted(C.multipliers,rng,x=>x[1])[0]:0};}
  function newBoard(rng,isFree=false){return Array.from({length:C.columns*C.rows},()=>makeCell(rng,isFree));}
  function evaluate(board,bet){
    const wins=[];
    for(const s of C.symbols.filter(s=>s.pays)){
      const indices=board.flatMap((x,i)=>x.id===s.id?[i]:[]);
      if(indices.length>=8){const tier=indices.length>=12?2:indices.length>=10?1:0;wins.push({id:s.id,count:indices.length,indices,amount:Math.round(bet*s.pays[tier])});}
    }
    return wins;
  }
  function collapse(board,indices,rng,isFree=false){
    const gone=new Set(indices);const next=board.map(x=>({...x}));
    for(let col=0;col<C.columns;col++){
      const keep=[];for(let row=0;row<C.rows;row++){const i=row*C.columns+col;if(!gone.has(i))keep.push({...board[i]});}
      const fresh=Array.from({length:C.rows-keep.length},()=>makeCell(rng,isFree));
      [...fresh,...keep].forEach((x,row)=>{next[row*C.columns+col]=x;});
    }
    return next;
  }
  function resolve(rng,bet,bonusMultiplier=0,isFree=false,initial=null){
    let board=initial?initial.map(x=>({...x})):newBoard(rng,isFree),base=0;const steps=[];
    for(let n=0;n<10000;n++){
      const wins=evaluate(board,bet);steps.push({board:board.map(x=>({...x})),wins});
      if(!wins.length)break;
      base+=wins.reduce((s,w)=>s+w.amount,0);
      board=collapse(board,wins.flatMap(w=>w.indices),rng,isFree);
      if(n===9999)throw new Error('Cascade safety limit reached');
    }
    const scatterCount=board.filter(x=>x.id==='scatter').length;
    const orbSum=board.reduce((s,x)=>s+x.m,0);
    let nextMultiplier=bonusMultiplier;
    if(isFree&&base>0&&orbSum>0)nextMultiplier+=orbSum;
    const multiplier=base>0&&orbSum>0?(isFree?nextMultiplier:orbSum):1;
    const scatterWin=!isFree&&scatterCount>=4?bet*(scatterCount>=6?100:scatterCount===5?5:3):0;
    return {steps,base,orbSum,multiplier,nextMultiplier,scatterCount,scatterWin,rawWin:Math.round(base*multiplier+scatterWin),
      awarded:isFree?(scatterCount>=3?C.retriggerSpins:0):(scatterCount>=4?C.freeSpins:0)};
  }
  function fresh(){return {version:C.id,balance:C.initialBalance,bet:C.defaultBet,free:0,bonusMultiplier:0,roundWin:0,bonusWin:0,
    stats:{paid:0,free:0,bought:0,wagered:0,won:0},history:[],board:null};}
  function validate(s){
    if(!s||s.version!==C.id||!Number.isSafeInteger(s.balance)||s.balance<0||!C.bets.includes(s.bet))return false;
    if(!Number.isSafeInteger(s.free)||s.free<0||!Number.isFinite(s.bonusMultiplier)||s.bonusMultiplier<0)return false;
    if(!Number.isSafeInteger(s.roundWin)||s.roundWin<0||s.roundWin>s.bet*C.maxWin||!Number.isSafeInteger(s.bonusWin)||s.bonusWin<0)return false;
    if(!s.stats||!['paid','free','bought','wagered','won'].every(k=>Number.isSafeInteger(s.stats[k])&&s.stats[k]>=0))return false;
    if(!Array.isArray(s.history)||s.history.length>30||!s.history.every(h=>h&&typeof h.free==='boolean'&&['n','bet','win','tumbles','multiplier'].every(k=>Number.isFinite(h[k])&&h[k]>=0)))return false;
    return s.board===null||(Array.isArray(s.board)&&s.board.length===30&&s.board.every(x=>x&&C.symbols.some(t=>t.id===x.id)&&Number.isFinite(x.m)&&x.m>=0));
  }
  class Engine{
    constructor(state=fresh(),rng=secureRandom){if(!validate(state))throw new Error('Invalid saved state');this.state=structuredClone(state);this.rng=rng;}
    setBet(bet){if(this.state.free)throw new Error('Ставка зафиксирована до конца бонуса');if(!C.bets.includes(bet))throw new Error('Недопустимая ставка');this.state.bet=bet;this.state.roundWin=0;}
    buy(){const s=this.state;if(s.free)throw new Error('Бонус уже идёт');const cost=s.bet*C.bonusCost;if(s.balance<cost)throw new Error('Недостаточно условных кредитов');s.balance-=cost;s.stats.wagered+=cost;s.stats.bought++;s.free=C.freeSpins;s.roundWin=0;s.bonusWin=0;s.bonusMultiplier=0;return cost;}
    spin(){
      const s=this.state,isFree=s.free>0;if(!isFree&&s.balance<s.bet)throw new Error('Недостаточно условных кредитов. Пополните баланс или уменьшите ставку.');
      // Calculate before mutation. A resolver failure cannot debit the wallet.
      const r=resolve(this.rng,s.bet,s.bonusMultiplier,isFree);
      if(isFree){s.free--;s.stats.free++;}else{s.balance-=s.bet;s.stats.wagered+=s.bet;s.stats.paid++;s.roundWin=0;s.bonusWin=0;s.bonusMultiplier=0;}
      const remaining=s.bet*C.maxWin-s.roundWin;r.win=Math.min(remaining,r.rawWin);s.roundWin+=r.win;s.balance+=r.win;s.stats.won+=r.win;
      s.bonusMultiplier=r.nextMultiplier;
      if(isFree)s.bonusWin+=r.win;
      if(r.awarded){s.free+=r.awarded;if(!isFree){s.bonusMultiplier=0;s.bonusWin=0;}}
      r.capped=s.roundWin>=s.bet*C.maxWin;
      if(r.capped)s.free=0;
      r.bonusEnded=isFree&&s.free===0;r.isFree=isFree;
      s.board=r.steps[r.steps.length-1].board;
      s.history.unshift({n:s.stats.paid+s.stats.free,free:isFree,bet:s.bet,win:r.win,tumbles:r.steps.length-1,multiplier:r.multiplier});s.history=s.history.slice(0,30);
      return r;
    }
  }
  const api={Engine,config:C,fresh,validate,seeded,weighted,makeCell,newBoard,evaluate,collapse,resolve};
  if(typeof module!=='undefined')module.exports=api;else root.SlotEngine=api;
})(typeof window!=='undefined'?window:globalThis);
