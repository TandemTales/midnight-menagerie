import assert from 'node:assert/strict';
import { Run, SNACKS } from '../../game/src/state/run.js';
import { NodeType, COMPANIONS } from '../../game/src/data/schema.js';
import { generateRegionMap } from '../../game/src/state/mapgen.js';
import { applyInput, ACT } from '../../game/src/net/actions.js';
const make = (region = 'foyer', kids = null) => {
  const run = new Run({seed:42, kids});
  run.region = region; run.route = [region]; run.regionIndex = 0; run._buildMap();
  run.save = () => {}; run.rescued = []; run.freedRoster = []; run.companionsFreed = [];
  return run;
};
for (const style of ['classic', 'floorplan']) for (const c of COMPANIONS) for (const seed of [1,42,1337]) {
  const map = generateRegionMap(c.region, seed, {style});
  assert.ok(map.nodes.every(n => n.type !== NodeType.RESCUE), `${style}/${c.region}/${seed}: no rescue rooms`);
}
for (const c of COMPANIONS) {
  const run = make(c.region);
  const boss = run.map.nodes.find(n => n.type === NodeType.BOSS);
  const room = run.map.nodes.find(n => n.type !== NodeType.BOSS);
  run.currentNodeId = room.id;
  assert.equal(run.rescueCompanion(c.slug), false, 'side rooms cannot rescue');
  assert.equal(applyInput(run, {t:'room',act:ACT.EVENT_RESCUE,slug:c.slug}), false);
  run.currentNodeId = boss.id;
  run._markCleared(boss.id);
  assert.equal(run.rescueCompanion(c.slug), false, 'visited is not boss victory');
  run.defeatedBoss = {region:c.region,nodeId:boss.id};
  assert.equal(run.rescueCompanion(COMPANIONS.find(p=>p.region!==c.region).slug),false,'wrong zone blocked');
  run.completeRegion();
  assert.deepEqual(run.companionsFreed, c.slug === 'marmalade' ? [] : [c.slug]);
  run.completeRegion();
  assert.ok(run.companionsFreed.length <= 1, 'boss cannot award twice');
}
const old = make(); old.currentNodeId = old.map.nodes[0].id;
old.currentNode.type = NodeType.RESCUE;
old.pendingEvent = {rescue:true,companion:'bones',nodeId:old.currentNodeId};
old.held = {region:'foyer',companion:'bones'};
const migrated = Run.resume(old.snapshot());
assert.equal(migrated.currentNode.type,NodeType.CURIOSITY);
assert.ok(migrated.pendingEvent.id && !migrated.pendingEvent.rescue);
assert.equal(migrated.held.companion,null);
assert.equal(migrated.rescued.includes('bones'),false);
for (const type of [NodeType.SCUFFLE,NodeType.BIG_SCARE,NodeType.BOSS,NodeType.CURIOSITY]) {
  const run = make('crypt', [{kid:'maya',companion:'marmalade'},{kid:'maya',companion:'wisp'}]);
  run.stats.combatWins=2;
  run._prepareReward(run.map.nodes[0], type, {navigate:false});
  const resumed = Run.resume(run.snapshot()); resumed.save=()=>{};
  for(let seat=0;seat<2;seat++) resumed.asSeat(seat,()=>{
    const id=resumed.pendingReward.snack;
    assert.ok(SNACKS.some(s=>s.id===id),'every second win offers a snack to every kid');
    resumed.claimReward({close:false});
    assert.equal(resumed.snacks.at(-1).id,id,'snack awarded after resume');
    resumed.claimReward({close:false});
    assert.equal(resumed.snacks.length,1,'claim is idempotent');
  });
}
const full=make();full.snacks=SNACKS.slice(0,full.snackCap);full.courage=10;
full.stats.combatWins=2;
full._prepareReward(full.map.nodes[0],NodeType.SCUFFLE,{navigate:false});
full.claimReward({close:false});assert.equal(full.courage,22);assert.equal(full.snacks.length,full.snackCap);
const victory=make('crypt');victory.currentNodeId= victory.map.nodes.find(n=>n.type===NodeType.BOSS).id;
victory.combat={players:[{hp:25}],stats:{}};victory._unwireCombat=()=>{};
victory._onCombatEnd({victory:true});
assert.equal(victory.defeatedBoss.nodeId,victory.currentNodeId);
const continued=Run.resume(victory.snapshot());continued.save=()=>{};
continued.claimReward();assert.ok(continued.rescued.includes('bones'),'real combat-end through resumed boss reward frees Bones');
const defeat=make('crypt');defeat.currentNodeId=defeat.map.nodes.find(n=>n.type===NodeType.BOSS).id;
defeat.combat={players:[{hp:0}],stats:{},enemies:[]};defeat._unwireCombat=()=>{};
defeat._onCombatEnd({victory:false});assert.equal(defeat.rescueCompanion('bones'),false);
console.log('PASS: 96 maps; every zone rescue gate; legacy rescue save; co-op snacks; full satchel; duplicate claim; boss victory/defeat and resume.');

let cadence=make('crypt', [{kid:'maya',companion:'marmalade'},{kid:'maya',companion:'wisp'}]);
for (let win=1;win<=6;win++) {
  const node=cadence.map.nodes.find(n=>n.type===NodeType.SCUFFLE&&!cadence.visitedIds.includes(n.id));
  assert.ok(node);
  cadence.currentNodeId=node.id;
  cadence.combat={players:[{hp:25},{hp:25}],stats:{}};
  cadence._unwireCombat=()=>{};
  cadence._onCombatEnd({victory:true});
  assert.equal(cadence.stats.combatWins,win);
  for(const kid of cadence.kids) assert.equal(!!kid.pendingReward.snack,win%2===0,`win ${win}, seat ${kid.seat}`);
  // Reload with the reward still open, then continue the cadence.
  cadence=Run.resume(cadence.snapshot());cadence.save=()=>{};
  for(const kid of cadence.kids) assert.equal(!!kid.pendingReward.snack,win%2===0,'reload preserves reward');
  if(win===3){cadence.region='nursery';cadence.route.push('nursery');cadence.regionIndex++;cadence._buildMap();}
}
assert.equal(defeat.stats.combatWins,0,'defeats do not advance snack cadence');
console.log('PASS: snacks on wins 2/4/6 only, across reloads and zones, for both co-op seats.');
