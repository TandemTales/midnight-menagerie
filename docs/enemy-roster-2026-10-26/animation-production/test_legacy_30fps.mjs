// Headless seam test of the real ClipPlayer and EnemyView._tickClip modules.
// Only network/image decoding and unused UI dependencies are replaced with I/O adapters.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve('.'), out=path.join(root,'docs/enemy-roster-2026-10-26/animation-production/legacy-30fps-2026-10-27');
const audit=JSON.parse(fs.readFileSync(path.join(out,'before.json')));
const context=vm.createContext({console,URL,fetch:async u=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(u),'utf8'))}),setTimeout,clearTimeout});
const cache=new Map();
function stub(id,exports){const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context,identifier:id});cache.set(id,m);return m;}
stub(path.join(root,'game/src/core/assets.js'),{assets:{image:async()=>({headless:true})}});
stub(path.join(root,'game/src/ui/intent.js'),{IntentView:class{},statusIconId:()=>''});
stub(path.join(root,'game/src/ui/icons.js'),{iconSvg:()=>''});
async function moduleAt(id){
 if(cache.has(id))return cache.get(id);
 const m=new vm.SourceTextModule(fs.readFileSync(id,'utf8'),{context,identifier:id,initializeImportMeta:meta=>{meta.url=pathToFileURL(id).href;}});cache.set(id,m);
 await m.link((s,parent)=>moduleAt(path.resolve(path.dirname(parent.identifier),s)));return m;
}
const enemy=await moduleAt(path.join(root,'game/src/ui/enemy.js'));await enemy.evaluate();
const {EnemyView}=enemy.namespace;const {ClipPlayer}=cache.get(path.join(root,'game/src/ui/sprite.js')).namespace;
function node(){return {attrs:{},setAttribute(k,v){this.attrs[k]=v;}};}
function view(p){const v=Object.create(EnemyView.prototype);Object.assign(v,{sprite:p,reduceMotion:false,$stillImg:node(),$stillRect:node(),$stillFit:node(),_clipSrc:null,_clipName:null});return v;}
const results=[];let samples=0;
for(const item of audit.index_files){
 const id=path.basename(path.dirname(item.path)),p=new ClipPlayer(id,{enemy:true,opening:'idle'});await p.ready;await Promise.all(Object.keys(p.clips).map(s=>p.preload(s)));const v=view(p);
 for(const [state,c] of Object.entries(p.clips)){
  assert.equal(c.fps,30,id+'/'+state);assert.equal(p.duration(state),c.frames*(c.ping?2:1)/30);
  p.play(state);v._tickClip(0);assert.equal(p.frame().index,0);let time=0;
  const n=c.frames*(c.ping?2:1);
  for(let i=0;i<n;i++){
   const target=(i+.5)/30;v._tickClip(target-time);time=target;
   const expected=c.ping&&i>=c.frames?2*c.frames-1-i:i;
   const f=p.frame();assert.equal(f.index,expected,`${id}/${state} sample ${i}`);assert.equal(f.clip,state);
   assert.equal(v.$stillImg.attrs.transform,`translate(${-f.col*c.fw} ${-f.row*c.fh})`);samples++;
  }
  v._tickClip(n/30-time+1e-7);
  if(c.loop){assert.equal(p.name,state);assert.equal(p.frame().index,0);}
  else if(c.hold){assert.equal(p.name,state);assert.equal(p.done,true);assert.equal(p.frame().index,c.frames-1);v._tickClip(5);assert.equal(p.frame().index,c.frames-1);}
  else{assert.equal(p.name,'idle');assert.equal(p.frame().index,0);}
  // Display refresh does not set the animation rate.
  for(const hz of [60,144]){p.play(state);const ticks=Math.min(Math.floor(n*hz/30)-1,Math.floor(hz*.25));for(let k=0;k<ticks;k++)v._tickClip(1/hz);assert.equal(p.frame().index,Math.floor((ticks/hz+1e-10)*30));}
  p.play(state);v.reduceMotion=true;v._tickClip(1);assert.equal(p.t,0);assert.equal(v.$stillImg.attrs.transform,'translate(0 0)');v.reduceMotion=false;
  results.push({enemy:id,state,frames:c.frames,fps:30,duration:p.duration(state),loop:c.loop,hold:!!c.hold,passed:true});
 }
 p.destroy();
}
// Negative control: deliberately wrong timing must fail the sampled rate check.
const probe=new ClipPlayer(results[0].enemy,{enemy:true});await probe.ready;await probe.preload('attack');probe.clips=JSON.parse(JSON.stringify(probe.clips));probe.clips.attack.fps=15;probe.play('attack');const pv=view(probe);pv._tickClip(.05);let rejected=false;try{assert.equal(probe.frame().index,1);}catch{rejected=true;}assert(rejected,'Rate gate failed to reject 15 fps');
const report={passed:true,clips:results.length,frame_samples:samples,refresh_rates:[60,144],negative_control_rejected:rejected,results,method:'Actual runtime modules executed in Node VM with local JSON fetch and decoded-image/UI I/O adapters. Real EnemyView._tickClip feeds real ClipPlayer. No browser or full game rendered test.'};
fs.writeFileSync(path.join(out,'runtime-test.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,clips:results.length,frame_samples:samples,negative_control_rejected:rejected}));
