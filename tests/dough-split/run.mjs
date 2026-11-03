// node tests/dough-split/run.mjs
// Real card definitions + combat engine + CombatScene event consumers. Only
// animation/DOM leaves are replaced; no combat rule is mocked here.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(specifier==='three')return {url:new URL('../../game/vendor/three.module.js',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
const { CombatEngine }=await import('../../game/src/combat/engine.js');
const { CombatScene }=await import('../../game/src/scenes/combat.js');
const { RNG }=await import('../../game/src/core/rng.js');
const { cardById }=await import('../../game/src/data/cards.js');
const { doughBlob,doughling }=await import('../../game/src/data/enemies/kitchens-cellars.js');
const { installTrackers }=await import('../../game/src/data/companions/_util.js');
const { Card }=await import('../../game/src/combat/piles.js');

const events=[];
const e=new CombatEngine({rng:new RNG(21972029),player:{name:'Maya',kid:'maya',companion:'marmalade',hp:77,maxHp:77,energyMax:3,drawPerTurn:0,deck:[]},enemies:[doughBlob]});
e.registerEnemies([doughBlob,doughling]);
e.setTrackerInstaller(installTrackers);
e.on('*',event=>events.push(event));
await e.startCombat();
const parent=e.enemies[0], parentId=parent.id;
async function play(id,upgraded=false,target=parentId){
  const card=new Card(cardById(id),{upgraded});
  e.piles._push(card,'hand','bottom');
  const legal=e.canPlay(card.uid,target);assert.equal(legal.ok,true,`${id} is legal: ${legal.reason}`);
  await e.playCard(card.uid,target);
}
await play('marmalade/predators-patience',true);
await e.endTurn();
await play('marmalade/fluff-up',true);
await play('marmalade/everywhere-at-once');
await e.endTurn();
await play('marmalade/scratch');
assert.equal(e.enemies.some(x=>x.id===parentId),false,'Divide removes original actor');
assert.equal(e.enemies.length,2,'two Doughlings remain');
for(const child of e.enemies){assert.equal(child.defId,'doughling');assert.equal(child.hp,11);}
const removed=events.find(x=>x.type==='entity:remove'&&x.id===parentId);
assert.ok(removed,'real engine emits removal');
const damage=events.filter(x=>x.type==='damage'&&x.targetId===parentId).at(-1);
assert.ok(Number.isFinite(damage.hpAfter),'threshold damage carries valid health');
assert.ok(damage.hpAfter>0&&damage.hpAfter<=16,'threshold hit splits rather than kills');

let destroyed=false,laidOut=0,painted;
const view={id:parentId,maxHp:34,alive:true,dying:false,
  flinch(){},clank(){},destroy(){destroyed=true;},
  setState(s){assert.ok(Number.isFinite(s.hp),'damage renderer never sends undefined/NaN health');painted=s;}};
const scene=Object.create(CombatScene.prototype);
scene.engine=e;scene.views=new Map([[parentId,view]]);scene.ctx={};scene.reduceMotion=true;
scene.fx={col:{guard:'guard',threat:'threat',threatHi:'threatHi'},slash(){},burst(){},number(){}};
scene._impactVeil=()=>{};scene._playerStrike=async()=>{};scene._pointOf=()=>({x:0,y:0});
scene._numeralSpot=()=>({x:0,y:0,rise:0});scene._addShake=()=>{};scene._syncActor=()=>{};
scene._renderIncoming=()=>{};scene._wait=async()=>{};scene._d=n=>n;
scene._layoutEnemies=()=>{laidOut++;};
// Negative control: reintroduce the original empty-snapshot fallback into an
// isolated copy of the actual method, never the live source. The same real
// split event must then trip the finite-health assertion.
const production=CombatScene.prototype._animDamage.toString();
const regression=production.replace(/tgt\.setState\(snap \|\| \{[\s\S]*?\}\);/,
  'tgt.setState(E.state.enemies.find(x => x.id === ev.targetId) || {});');
assert.notEqual(regression,production,'negative control injected original regression');
const badAnimation=new Function(`return ${regression.replace('async _animDamage(', 'async function(')}`)();
await assert.rejects(badAnimation.call(scene,damage),/undefined\/NaN health/);
await scene._animDamage(damage);
assert.equal(painted.hp,damage.hpAfter,'removed actor paints the real impact snapshot');
await scene._animate(removed);
assert.equal(scene.views.has(parentId),false,'actual event consumer removes orphan target');
assert.equal(view.alive,false,'departed view is no longer selectable');
assert.equal(destroyed,true,'view disposer runs');
assert.equal(laidOut,1,'board reflows once');
await scene._animate(removed);
assert.equal(laidOut,1,'duplicate removal is harmless');
// Missing an event must also converge to the engine at the settle boundary.
scene.views.set(parentId,view);view.alive=true;destroyed=false;
scene.$turnN={textContent:''};
for(const name of ['_syncPlayer','_renderRules','_syncPiles','_syncNerve','_reconcileHand','_syncHandPlayability','_syncEndTurn'])scene[name]=()=>{};
scene._syncAll();
assert.equal(scene.views.has(parentId),false,'settle reconciles a missed removal event');
assert.equal(destroyed,true,'orphan reconciliation disposes view');
console.log('PASS: exact three-turn Marmalade sequence; negative control rejects pre-fix renderer; finite impact snapshot; real removal event removes stale target; idempotent cleanup; missed-event convergence.');
