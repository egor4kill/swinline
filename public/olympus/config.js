(function(root){
  const config = {
    id:'olympus-swinline-v1', columns:6, rows:5, initialBalance:0,
    bets:[20,50,100,200,500,1000,2000,5000,10000], defaultBet:1000,
    bonusCost:100, freeSpins:15, retriggerSpins:5, maxWin:15000, freeOrbWeight:5,
    symbols:[
      {id:'crown',name:'Корона',weight:4,pays:[10,25,50]},
      {id:'hourglass',name:'Песочные часы',weight:5,pays:[2.5,10,25]},
      {id:'ring',name:'Кольцо',weight:7,pays:[2,5,15]},
      {id:'cup',name:'Кубок',weight:8,pays:[1.5,2,12]},
      {id:'red',name:'Красный камень',weight:10,pays:[1,1.5,10]},
      {id:'purple',name:'Фиолетовый камень',weight:12,pays:[0.8,1.2,8]},
      {id:'yellow',name:'Жёлтый камень',weight:14,pays:[0.5,1,5]},
      {id:'green',name:'Зелёный камень',weight:16,pays:[0.4,0.9,4]},
      {id:'blue',name:'Синий камень',weight:18,pays:[0.25,0.75,2]},
      {id:'scatter',name:'Скаттер',weight:1.1},
      {id:'orb',name:'Множитель',weight:0.8}
    ],
    multipliers:[[2,40],[3,24],[4,14],[5,10],[6,5],[8,3],[10,2],[15,1],[20,0.5],[25,0.25],[50,0.12],[100,0.05],[250,0.02],[500,0.008],[1000,0.002]]
  };
  root.SLOT_CONFIG=config;
  if(typeof module!=='undefined')module.exports=config;
})(typeof window!=='undefined'?window:globalThis);
