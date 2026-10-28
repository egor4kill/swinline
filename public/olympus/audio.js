/* Locally decoded original sound assets. Playback begins on a user gesture. */
(()=>{
 const names=AUDIO_DATA.names,cache=new Map(),active=new Set();
 let ctx,master,musicBus,fxBus,musicSource,musicName='',spinSource,enabled=true,musicEnabled=true,volume=.55,unlocked=false,wantedBonus=false;
 try{const pref=JSON.parse(localStorage.getItem('olympus-audio')||'null');if(pref){enabled=!!pref.enabled;musicEnabled=!!pref.music;volume=Math.max(0,Math.min(1,Number(pref.volume)||0));}}catch{}
 function save(){try{localStorage.setItem('olympus-audio',JSON.stringify({enabled,music:musicEnabled,volume}));}catch{}}
 function init(){if(ctx)return;ctx=new AudioContext();master=ctx.createGain();master.gain.value=enabled?volume:0;const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=18;limiter.ratio.value=5;master.connect(limiter).connect(ctx.destination);musicBus=ctx.createGain();musicBus.gain.value=.45;musicBus.connect(master);fxBus=ctx.createGain();fxBus.gain.value=.7;fxBus.connect(master);}
 async function buffer(name){const url=names[name];if(!url)return null;if(!cache.has(url))cache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error('Audio '+r.status);return r.arrayBuffer();}).then(a=>ctx.decodeAudioData(a)).catch(e=>{cache.delete(url);console.warn('Audio asset:',name,e.message);return null;}));return cache.get(url);}
 function ramp(g,value,seconds=.25){if(!ctx)return;g.gain.cancelScheduledValues(ctx.currentTime);g.gain.setValueAtTime(g.gain.value,ctx.currentTime);g.gain.linearRampToValueAtTime(value,ctx.currentTime+seconds);}
 async function music(bonus=wantedBonus){wantedBonus=bonus;if(!ctx||!unlocked||!enabled||!musicEnabled)return;const name=bonus?'bonusMusic':'baseMusic';if(musicName===name)return;musicName=name;const data=await buffer(name);if(!data||musicName!==name||!enabled||!musicEnabled)return;
  const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=data;source.loop=true;gain.gain.value=0;source.connect(gain).connect(musicBus);source.start();ramp(gain,.75,.8);
  if(musicSource){const prev=musicSource;ramp(prev.gain,0,.65);try{prev.source.stop(ctx.currentTime+.7);}catch{}}
  musicSource={source,gain};
 }
 async function unlock(){init();unlocked=true;await ctx.resume();if(enabled)music();}
 async function play(name,gain=1,rate=1,maxSeconds=2.8){if(!enabled||!unlocked||!ctx||document.hidden)return;const data=await buffer(name);if(!data||!enabled||document.hidden)return;const source=ctx.createBufferSource(),g=ctx.createGain();source.buffer=data;source.playbackRate.value=rate;g.gain.value=gain;source.connect(g).connect(fxBus);source.start();if(data.duration/rate>maxSeconds){g.gain.setValueAtTime(gain,ctx.currentTime+maxSeconds-.15);g.gain.linearRampToValueAtTime(0,ctx.currentTime+maxSeconds);source.stop(ctx.currentTime+maxSeconds);}active.add(source);source.onended=()=>active.delete(source);return source;}
 let spinToken=0;
 async function spinStart(){const token=++spinToken;play('spinStart',.7);const data=ctx&&enabled&&unlocked?await buffer('spinLoop'):null;if(!data||token!==spinToken||!enabled)return;spinSource=ctx.createBufferSource();spinSource.buffer=data;spinSource.loop=true;const g=ctx.createGain();g.gain.value=.22;spinSource.connect(g).connect(fxBus);spinSource.start();}
 function spinStop(){spinToken++;if(spinSource){try{spinSource.stop();}catch{}spinSource=null;}}
 function mute(value){enabled=value;save();if(master)ramp(master,enabled?volume:0,.12);if(!enabled){spinStop();for(const s of active){try{s.stop();}catch{}}active.clear();}else if(unlocked)music();}
 function toggleMusic(){musicEnabled=!musicEnabled;save();if(!musicEnabled){musicName='';if(musicSource){ramp(musicSource.gain,0,.35);musicSource.source.stop(ctx.currentTime+.4);musicSource=null;}}else music();return musicEnabled;}
 document.addEventListener('visibilitychange',()=>{if(!ctx||!unlocked)return;if(document.hidden)ctx.suspend();else ctx.resume().catch(()=>{});});
 window.gameAudio={unlock,play,music,spinStart,spinStop,
  toggle(){mute(!enabled);return enabled;},toggleMusic,
  volume(v){volume=Math.max(0,Math.min(1,v));save();if(master)ramp(master,enabled?volume:0,.1);},
  duck(seconds=1.2){if(!ctx)return;ramp(musicBus,.17,.12);setTimeout(()=>ramp(musicBus,.45,.5),seconds*1000);},
  get state(){return {enabled,music:musicEnabled,volume,unlocked,context:ctx?.state,musicTrack:musicName,decoded:cache.size,active:active.size};}
 };
})();
