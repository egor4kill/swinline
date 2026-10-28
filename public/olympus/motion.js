/* WAAPI choreography: only transform and opacity per frame; geometry read once. */
(()=>{
 const board=document.getElementById('board'),stage=document.getElementById('stage');
 const fx=document.createElement('div');fx.id='fx-layer';fx.setAttribute('aria-hidden','true');stage.append(fx);
 let fast=false;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const ease='cubic-bezier(0.23,1,0.32,1)';
 const duration=n=>reduced?0:Math.round(n*(fast?.28:1));
 const pause=n=>new Promise(r=>setTimeout(r,duration(n)));
 function animate(el,frames,ms,delay=0,easing=ease){if(reduced)return Promise.resolve();return el.animate(frames,{duration:duration(ms),delay:duration(delay),easing,fill:'backwards'}).finished.catch(()=>{});}
 function make(cell){const d=document.createElement('div');d.className='cell '+cell.id;d.dataset.symbol=cell.id;const img=new Image();img.src='assets/'+cell.id+'.png';img.alt='';d.append(img);if(cell.id==='orb'){const s=document.createElement('span');s.textContent='×'+cell.m;d.append(s);}return d;}
 function render(cells){board.replaceChildren(...cells.map(make));const counts={};for(const c of cells)counts[c.id]=(counts[c.id]||0)+1;board.setAttribute('aria-label',Object.entries(counts).map(([s,n])=>`${s}: ${n}`).join(', '));}
 function rect(el){const a=el.getBoundingClientRect(),s=stage.getBoundingClientRect();return{x:a.x-s.x+a.width/2,y:a.y-s.y+a.height/2,width:a.width,height:a.height};}
 function particles(el,kind='gold',count=12){if(reduced)return;const r=rect(el);for(let i=0;i<count;i++){
  const dot=document.createElement('i');dot.className='particle '+kind;dot.style.left=r.x+'px';dot.style.top=r.y+'px';const angle=i/count*Math.PI*2;const dist=r.width*(.5+Math.random()*.9);fx.append(dot);
  animate(dot,[{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:`translate(calc(-50% + ${Math.cos(angle)*dist}px),calc(-50% + ${Math.sin(angle)*dist+24}px)) scale(.3)`,opacity:0}],650).then(()=>dot.remove());
 }}
 async function enter(cells){
  stage.classList.add('spinning');gameAudio.spinStart();
  await Promise.all([...board.children].map((el,i)=>animate(el,[{transform:'translateY(0)',opacity:1},{transform:'translateY(130%)',opacity:0}],180,(i%6)*25+Math.floor(i/6)*12,'ease-in-out')));
  render(cells);
  const jobs=[...board.children].map((el,i)=>animate(el,[{transform:'translateY(-560%)',opacity:0},{transform:'translateY(7%)',opacity:1,offset:.8},{transform:'translateY(0)',opacity:1}],460,(i%6)*75+Math.floor(i/6)*16));
  for(let col=0;col<6;col++){
   const scatter=cells.some((c,i)=>i%6===col&&c.id==='scatter');
   pause(420+col*75).then(()=>{gameAudio.play(scatter?'multiplier':'land',scatter?.45:.32,1+col*.035);});
  }
  await Promise.all(jobs);gameAudio.spinStop();stage.classList.remove('spinning');
 }
 async function highlight(indices,level=0){
  const nodes=indices.map(i=>board.children[i]);nodes.forEach(n=>n.classList.add('winning'));
  window.playSymbolWin?.(nodes);
  gameAudio.play('win',.45,1+Math.min(level,5)*.06);
  await Promise.all(nodes.map(n=>animate(n,[{transform:'scale(1)'},{transform:'scale(1.13)',offset:.45},{transform:'scale(1.05)'}],300)));
  await pause(180);
 }
 async function cascade(cells,removed,level=0){
  window.clearSymbolWins?.();
  const set=new Set(removed),old=[...board.children],distance=board.clientHeight/5;
  gameAudio.play(['vanish','vanish2','vanish3'][level%3],.7);
  await Promise.all(removed.map(i=>{particles(old[i],'gold',8);return animate(old[i],[{transform:'scale(1.05)',opacity:1},{transform:'scale(1.2)',opacity:.8,offset:.35},{transform:'scale(.8)',opacity:0}],250);}));
  const next=Array(30),jobs=[];
  for(let col=0;col<6;col++){
   const survivors=[];for(let row=0;row<5;row++){const i=row*6+col;if(!set.has(i))survivors.push({el:old[i],row});}
   const fresh=5-survivors.length;
   for(let row=0;row<5;row++){
    const i=row*6+col,keep=row>=fresh?survivors[row-fresh]:null;
    const el=keep?keep.el:make(cells[i]);el.classList.remove('winning');next[i]=el;
    const dy=keep?(keep.row-row)*distance:-(fresh-row+1)*distance;
    if(dy)jobs.push({el,dy,delay:col*20+(keep?0:row*18)});
   }
  }
  board.replaceChildren(...next);
  await Promise.all(jobs.map(({el,dy,delay})=>animate(el,[{transform:`translateY(${dy}px)`,opacity:1},{transform:'translateY(4px)',opacity:1,offset:.85},{transform:'translateY(0)',opacity:1}],400,delay)));
  gameAudio.play('land2',.55,1+Math.min(level,4)*.06);await pause(100);
 }
 function floating(el,text){const pos=rect(el),label=document.createElement('b');label.className='floating-win';label.textContent=text;label.style.left=pos.x+'px';label.style.top=pos.y+'px';fx.append(label);animate(label,[{transform:'translate(-50%,10px) scale(.9)',opacity:0},{transform:'translate(-50%,-10px) scale(1)',opacity:1,offset:.25},{transform:'translate(-50%,-65px) scale(1)',opacity:0}],950).then(()=>label.remove());}
 async function collect(cells,target){
  const orbs=cells.flatMap((c,i)=>c.id==='orb'?[{c,i}]:[]);if(!orbs.length)return;
  window.sceneThunder?.();gameAudio.play('thunder',.65);flash();
  const dest=rect(target);
  await Promise.all(orbs.map(async({c,i},n)=>{const el=board.children[i];await pause(n*140);particles(el,'electric',16);gameAudio.play('multiplier',.55,1+n*.06);const p=rect(el),ghost=el.cloneNode(true);ghost.className+=' orb-flight';ghost.style.left=(p.x-p.width/2)+'px';ghost.style.top=(p.y-p.height/2)+'px';ghost.style.width=p.width+'px';ghost.style.height=p.height+'px';fx.append(ghost);await animate(ghost,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${(dest.x-p.x)*.4}px,${dest.y-p.y-55}px) scale(.85)`,opacity:1,offset:.5},{transform:`translate(${dest.x-p.x}px,${dest.y-p.y}px) scale(.25)`,opacity:0}],650);ghost.remove();gameAudio.play('collect',.5);particles(target,'electric',10);}));
  await animate(target,[{transform:'scale(1)'},{transform:'scale(1.25)',offset:.5},{transform:'scale(1)'}],300);
 }
 function flash(){if(reduced)return;const el=document.createElement('div');el.className='lightning-flash';fx.append(el);animate(el,[{opacity:0},{opacity:.7,offset:.1},{opacity:0,offset:.25},{opacity:.3,offset:.35},{opacity:0}],400).then(()=>el.remove());}
 async function transition(bonus){gameAudio.play('transition',.7);const curtain=document.createElement('div');curtain.className='bonus-curtain';fx.append(curtain);await animate(curtain,[{opacity:0},{opacity:1}],350);window.setBonusScene?.(bonus);stage.classList.toggle('bonus',bonus);gameAudio.music(bonus);await animate(curtain,[{opacity:1},{opacity:0}],500);curtain.remove();}
 function coins(count=35){if(reduced)return;for(let i=0;i<count;i++){const coin=document.createElement('i');coin.className='win-coin';coin.style.left=(25+Math.random()*50)+'%';coin.style.top='35%';fx.append(coin);const dx=(Math.random()-.5)*stage.clientWidth*.9,dy=stage.clientHeight*.8;animate(coin,[{transform:'translate(0,0) rotateY(0deg)',opacity:1},{transform:`translate(${dx*.45}px,-110px) rotateY(360deg)`,opacity:1,offset:.35},{transform:`translate(${dx}px,${dy}px) rotateY(900deg)`,opacity:0}],1500,i*25,'linear').then(()=>coin.remove());}}
 async function count(el,value,format,ms=650){if(reduced||fast){el.textContent=format(value);return;}const start=performance.now();await new Promise(resolve=>{function tick(now){const p=Math.min(1,(now-start)/ms),e=1-Math.pow(1-p,3);el.textContent=format(Math.round(value*e));if(p<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});}
 window.gameMotion={render,enter,highlight,cascade,collect,transition,coins,count,floating,flash,pause,animate,setFast:v=>fast=v};
})();
