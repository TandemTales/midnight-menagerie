// node tests/ward-targeting/run.mjs
// Real engine/content -> CombatScene -> Hand keyboard and pointer target seam.
// Only DOM geometry and animation leaves are inert; no target rule is mocked.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier, context, next) {
  if (specifier === 'three') return {url:new URL('../../game/vendor/three.module.js',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
const {CombatEngine}=await import('../../game/src/combat/engine.js');
const {CombatScene}=await import('../../game/src/scenes/combat.js');
const {Hand}=await import('../../game/src/ui/hand.js');
const {EnemyView}=await import('../../game/src/ui/enemy.js');
const {RNG}=await import('../../game/src/core/rng.js');
const {Card}=await import('../../game/src/combat/piles.js');
const {cardById,allCards}=await import('../../game/src/data/cards.js');
const {wardPup,walkingCage,cageLatch}=await import('../../game/src/data/enemies/kennels.js');
const {ENEMY_STATUSES}=await import('../../game/src/data/enemies/index.js');
const {registerStatuses}=await import('../../game/src/combat/statuses.js');
const {installTrackers}=await import('../../game/src/data/companions/_util.js');
registerStatuses(ENEMY_STATUSES);
const e=new CombatEngine({rng:new RNG(21972029),player:{name:'Maya',kid:'maya',companion:'marmalade',hp:70,maxHp:70,energyMax:3,drawPerTurn:0,deck:[]},enemies:[wardPup,walkingCage]});
const events=[];e.on('*',event=>events.push(event));
e.registerEnemies([wardPup,walkingCage,cageLatch]);
e.setTrackerInstaller(installTrackers);
await e.startCombat();
const dog=e.enemies.find(x=>x.defId==='ward-pup');
const cage=e.enemies.find(x=>x.defId==='walking-cage');
const latch=e.enemies.find(x=>x.defId==='cage-latch');
assert.ok(latch,'real Walking Cage spawn fits a latch');
const attack=new Card(cardById('marmalade/scratch'));
const skill=new Card(allCards().find(c=>c.type==='skill'&&c.target==='enemy'));
e.piles._push(attack,'hand','bottom');e.piles._push(skill,'hand','bottom');
assert.equal(e.canPlay(attack.uid,dog.id).ok,false,'engine refuses attacking the Ward animal');
const scene=Object.create(CombatScene.prototype);scene.engine=e;
const rect={left:0,top:0,width:100,height:100};
scene.views=new Map(e.enemies.map(x=>[x.id,{id:x.id,alive:true,dying:false,$stage:{getBoundingClientRect:()=>rect}}]));
const ids=card=>scene._handTargets(card).map(x=>x.id);
assert.deepEqual(ids(attack),[cage.id,latch.id]);
assert.equal(scene._defaultTargetFor(attack.uid),cage.id,'default skips first living but protected actor');
// Restore the old view-only filter as a negative control: this same fixture
// catches its unsafe target list without changing production code.
const oldIds=[...scene.views.values()].filter(v=>v.alive&&!v.dying).map(v=>v.id);
assert.ok(oldIds.includes(dog.id)&&!ids(attack).includes(dog.id));

const hand=Object.create(Hand.prototype);
hand.el={getBoundingClientRect:()=>rect};
let requested;
hand.getTargets=card=>{requested=card;return scene._handTargets(card);};
hand.slots=[{card:attack,playable:true,cur:{x:0},view:{pulse(){},shake(){throw Error('Unexpected target failure');}}}];
hand.selIdx=0;hand.bus={emit(){}};hand.clock={ramp(){}};hand._d=n=>n;
for(const name of ['_applyPreview','_showArrow','_reparkAim'])hand[name]=()=>{};
hand._confirm();
assert.equal(requested,attack,'keyboard selection supplies the actual card');
assert.equal(hand.aim.snap.id,cage.id);
hand._cycleTarget(1);assert.equal(hand.aim.snap.id,latch.id);
hand._cycleTarget(1);assert.equal(hand.aim.snap.id,cage.id,'cycle never stops on the dog');
hand.hit={setPointerCapture(){}};hand._local=()=>({x:50,y:50});
hand._hitTest=()=>hand.slots[0];hand._setHover=()=>{};
hand.slots[0].view.setState=()=>{};
requested=null;hand._pointerDown({pointerId:1,preventDefault(){}});
assert.equal(requested,attack,'pointer pickup supplies the actual card');
hand._updateSnap(50,50);
assert.equal(hand.drag.snap.id,cage.id,'pointer snapping uses the filtered list too');

// The filter must respect the selected card, not hide every protected-looking
// actor globally. Hidden forbids attacks while enemy-targeted skills still aim.
e.applyStatus(cage,'hidden',1);
assert.equal(e.isTargetable(cage,attack),false,'real Hidden status blocks attacks');
assert.equal(ids(attack).includes(cage.id),false);
assert.equal(ids(skill).includes(cage.id),true,'Hidden remains a skill target');
assert.equal(ids(skill).includes(dog.id),false,'Ward remains protected for skills');
scene.views.get(latch.id).dying=true;
assert.deepEqual(ids(attack),[],'dying views cannot be aimed at');
scene.views.get(latch.id).dying=false;
let tapped;
scene.hand={playCard:(uid,id)=>{tapped={uid,id};}};scene.confirmSingleTarget=false;
scene._deny=reason=>{throw Error(reason);};
await scene._tapPlay(attack.uid);
assert.deepEqual(tapped,{uid:attack.uid,id:latch.id},'single-target tap ignores protected and Hidden actors');

let label;
const view=Object.create(EnemyView.prototype);
Object.assign(view,{name:dog.name,def:wardPup,tier:'normal',hp:dog.hp,maxHp:dog.maxHp,block:0,lastIntent:true,intentView:{ariaLabel:()=> 'Frightened'},el:{setAttribute:(_,text)=>{label=text;}}});
view._syncAria();
assert.match(label,/Ward animal\. Protected; cannot be attacked or hurt/);
assert.doesNotMatch(label,/Enemy|Courage/);
assert.doesNotMatch(label,/Next:/,'protected animal does not announce a combat intent');
view.def=walkingCage;view.name=cage.name;view._syncAria();
assert.match(label,/Enemy\./,'ordinary enemies keep their combat description');
// Actual presentation method: only its DOM construction leaves are substituted.
const parts=Object.fromEntries(['.cb-enemy__bar','.cb-enemy__guard','.cb-enemy__intent'].map(key=>[key,{hidden:false,style:{}}]));
let protectedLabel;
parts['.cb-enemy__vitals']={prepend:node=>{protectedLabel=node;}};
globalThis.document={createElement:()=>({style:{}})};
const presentation=Object.create(EnemyView.prototype);
presentation.el={querySelector:selector=>parts[selector]};
presentation.role='normal';presentation._presentWard();
assert.equal(protectedLabel,undefined,'regular enemies retain normal presentation');
presentation.role='ward';presentation._presentWard();
assert.equal(protectedLabel.textContent,'Protected animal');
for(const selector of ['.cb-enemy__bar','.cb-enemy__guard','.cb-enemy__intent']){
  assert.equal(parts[selector].hidden,true);assert.equal(parts[selector].style.display,'none');
}
delete globalThis.document;
// Free the real animal through its actual latch. The scene must retire only
// that animal's stale instruction card, not the remaining Cage's House Rule.
scene._rules=new Map();
for(const ev of events.filter(ev=>ev.type==='rule')){
  if(ev.action==='clear')scene._rules.delete(ev.rule.id);
  else scene._rules.set(ev.rule.id,{...ev.rule,sourceId:ev.sourceId});
}
assert.ok([...scene._rules.values()].some(r=>r.sourceId===dog.id),'initial animal rule is present');
const retained=[...scene._rules.values()].filter(r=>r.sourceId!==dog.id).map(r=>r.id);
scene.views.get(dog.id).role='ward';scene.views.get(dog.id).destroy=()=>{};
let rulesRefreshed=0;scene._renderRules=()=>{rulesRefreshed++;};
scene._layoutEnemies=()=>{};scene._renderIncoming=()=>{};
await e.playCard(attack.uid,latch.id);
const second=new Card(cardById('marmalade/scratch'));e.piles._push(second,'hand','bottom');
assert.equal(e.canPlay(second.uid,latch.id).ok,true);
await e.playCard(second.uid,latch.id);
assert.equal(e.enemies.some(x=>x.id===dog.id),false,'breaking actual latch frees and despawns animal');
const departure=events.find(ev=>ev.type==='entity:remove'&&ev.id===dog.id);
assert.ok(departure);await scene._animate(departure);
assert.equal([...scene._rules.values()].some(r=>r.sourceId===dog.id),false,'departed animal instructions removed');
assert.ok(retained.every(id=>scene._rules.has(id)),'other rule cards retained');
assert.equal(rulesRefreshed,1,'dock refreshes immediately at departure');
console.log('PASS: Ward/Hidden targeting, keyboard and pointer seams, protected visible/accessible presentation, ordinary enemies unchanged, and real latch-release removes only stale Ward instructions.');
