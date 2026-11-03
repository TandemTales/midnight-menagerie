async mode=>{
 const s=MM.ctx.scenes.current,E=s.engine;await s._settle();await document.fonts.ready;s.fx.clear();
 const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
 const hits=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
 const failures=new Map(),delivered=new Map(),expired=[];let frames=0,peak=0,all=null,first=performance.now(),lastActive=first,pausedMs=0;const layoutTimes=[],frameTimes=[];let priorFrame=performance.now();
 const fit=s.fx._fitWords;s.fx._fitWords=function(...args){const t=performance.now();try{return fit.apply(this,args)}finally{layoutTimes.push(performance.now()-t)}};
 let serial=0;const slotSerial=new WeakMap(),starts=[];
 const number=s.fx.number;s.fx.number=function(x,y,text,o={}){
  if(!o._proofSerial)o={...o,_proofSerial:++serial};const slot=this.nums.find(n=>!n.live);
  const result=number.call(this,x,y,text,o);
  if(slot?.live){slotSerial.set(slot,o._proofSerial);starts.push({serial:o._proofSerial,text,owner:o.actorId,delay:performance.now()-first-pausedMs,duration:slot.dur});}
  return result;
 };
 const update=s.fx._updateNumbers;s.fx._updateNumbers=function(dt){
  for(const n of this.nums)if(n.live&&n.t+dt>=n.dur)expired.push({serial:slotSerial.get(n),key:n.actorId+' '+n.el.textContent,duration:n.dur,elapsed:n.t+dt});return update.call(this,dt);
 };
 const sample=()=>{const now=performance.now();frameTimes.push(now-priorFrame);priorFrame=now;
  const bound=s._wordBounds(E.player.id),f=s.fx,labels=f.nums.filter(n=>n.live&&n.t>=0&&+n.el.style.opacity>0).map(n=>({serial:slotSerial.get(n),text:n.el.textContent,owner:n.actorId,rect:(()=>{const box=rect(n.el),range=document.createRange();range.selectNodeContents(n.el);const ink=range.getBoundingClientRect();return {left:Math.min(box.left,ink.left),right:Math.max(box.right,ink.right),top:Math.min(box.top,ink.top),bottom:Math.max(box.bottom,ink.bottom)}})(),expected:n.wordBox}));
  const partyName=mode==='all-long'?'Maya Chen & Count Crumbula':'Maya Chen & Bones';
  if(bound.actors.find(a=>a.id===E.player.id)?.name!==partyName)failures.set('party-identity',{kind:'party-identity',expected:partyName,actual:bound.actors.find(a=>a.id===E.player.id)?.name});
  const activeOwners=[...new Set(f.nums.filter(n=>n.live&&n.t>=0&&+n.el.style.opacity>0).map(n=>n.actorId).filter(Boolean))];
  const captions=[...document.querySelectorAll('[data-fx-owner]')].filter(el=>el.style.visibility==='visible').map(el=>{const range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect(),box=rect(el);return {caption:true,text:el.textContent,owner:el.dataset.fxOwner,rect:{left:Math.min(box.left,text.left),right:Math.max(box.right,text.right),top:Math.min(box.top,text.top),bottom:Math.max(box.bottom,text.bottom)},font:window.r56CaptionFont}});
  for(const id of activeOwners){
   const caps=captions.filter(c=>c.owner===id),actor=bound.actors.find(a=>a.id===id);
   if(caps.length!==1)failures.set('caption-count '+id,{kind:'caption-count',id,count:caps.length});
   if(caps[0]&&(caps[0].text!==actor?.name||caps[0].font<17))failures.set('caption-name '+id,{kind:'caption-name',caption:caps[0],actor});
  }
  for(const cap of captions)if(!activeOwners.includes(cap.owner))failures.set('orphan-caption '+cap.owner,{kind:'orphan-caption',cap});
  const geometry=[...labels,...captions];
  const protectedBoxes=[...bound.actors.map(a=>({...a,type:'actor:'+a.id})),...bound.plates.map((a,i)=>({...a,type:'ui:'+i}))].map(a=>({...a,left:a.left+f.left,right:a.right+f.left,top:a.top+f.top,bottom:a.bottom+f.top}));
  for(const a of geometry){
   if(!a.caption){const b=a.expected,outside=Math.max(0,b.left+f.left-a.rect.left,a.rect.right-b.right-f.left,b.top+f.top-a.rect.top,a.rect.bottom-b.bottom-f.top);if(outside>1)failures.set('ribbon-ink '+a.serial,{kind:'ribbon-ink',outside,label:a});}

   const key=a.serial+' '+a.owner+' '+a.text;if(!a.caption&&!delivered.has(key))delivered.set(key,{key,delay:now-first-pausedMs});
   for(const b of protectedBoxes)if(hits(a.rect,b))failures.set(key+' '+b.type,{kind:'protected',label:a,obstacle:b});
   if(a.rect.left<0||a.rect.right>innerWidth||a.rect.top<0||a.rect.bottom>innerHeight)failures.set('viewport '+key,{kind:'viewport',label:a});
   const actor=bound.actors.find(b=>b.id===a.owner),cx=(a.rect.left+a.rect.right)/2-f.left,cy=(a.rect.top+a.rect.bottom)/2-f.top;
   if(actor&&(Math.abs(cx-actor.x)>Math.max(230,(actor.right-actor.left)/2+180)||cy<actor.top-220||cy>actor.bottom+100))failures.set('local '+key,{kind:'local',label:a,actor});
  }
  for(let i=0;i<geometry.length;i++)for(let j=i+1;j<geometry.length;j++)if(hits(geometry[i].rect,geometry[j].rect))failures.set('labels '+geometry[i].owner+geometry[i].text+geometry[j].owner+geometry[j].text,{kind:'labels',a:geometry[i],b:geometry[j]});
  frames++;if(labels.length>peak){peak=labels.length;all={labels,captions,protectedBoxes,layout:f.wordLayout};}
  if(f.nums.some(n=>n.live)||f.wordQueue?.length)lastActive=now;
 };
 if(mode==='repeats'){for(let i=0;i<6;i++)E.applyStatus(E.livingEnemies()[1],'vulnerable',2);}
 else if(mode==='all'||mode==='all-long'){
  for(const e of E.livingEnemies())E.applyStatus(e,'vulnerable',2);
  E.applyStatus(E.player,'dexterity',2);E.applyStatus(E.player,'regen',3);
 }else{
  const e=E.livingEnemies()[Number(mode)||0];E.applyStatus(e,'strength',3);E.applyStatus(e,'vulnerable',2);E.applyStatus(e,'bristle',4);
  E.applyStatus(E.player,'weak',2);E.applyStatus(E.player,'dexterity',2);E.applyStatus(E.player,'regen',3);
 }
 window.r49ProbeDone=false;window.r49Capture=false;
 while(performance.now()-first<12000){
  sample();if(!window.r49Capture&&peak>=window.r49CaptureTarget){window.r49Capture=true;MM.ctx.clock.pause();const pauseStart=performance.now();await new Promise(r=>setTimeout(r,500));pausedMs+=performance.now()-pauseStart;MM.ctx.clock.resume();priorFrame=performance.now();}
  if(expired.length>=6&&!s.fx.nums.some(n=>n.live)&&!s.fx.wordQueue?.length)break;
  await new Promise(requestAnimationFrame);
 }
 if(document.querySelectorAll('[data-fx-owner]').length)failures.set('caption-cleanup',{kind:'caption-cleanup'});
 s.fx._fitWords=fit;s.fx._updateNumbers=update;s.fx.number=number;const sorted=frameTimes.filter(x=>x>0).sort((a,b)=>a-b);window.r49ProbeDone=true;
 return {rawFrameTimes:frameTimes,mode,frames,peak,all,layoutTimes,frameTimes:{max:Math.max(...sorted),p95:sorted[Math.floor(sorted.length*.95)]},failures:[...failures.values()],actors:E.livingEnemies().length,heroLoaded:!!s.hero._kidSrc,delivered:[...delivered.values()],expired,starts,drainMs:lastActive-first-pausedMs,pausedMs,queued:s.fx.wordQueue?.length||0};
}