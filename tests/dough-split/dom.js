// Optional DOM seam check in the existing game browser. Does not use or mutate
// window.MM, its Run, save, health, or RNG. Call runDoughSplitDOM() from this module.
import { CombatEngine } from '../../game/src/combat/engine.js';
import { CombatScene } from '../../game/src/scenes/combat.js';
import { EnemyView } from '../../game/src/ui/enemy.js';
import { RNG } from '../../game/src/core/rng.js';
import { cardById } from '../../game/src/data/cards.js';
import { doughBlob,doughling } from '../../game/src/data/enemies/kitchens-cellars.js';
import { installTrackers } from '../../game/src/data/companions/_util.js';
import { Card } from '../../game/src/combat/piles.js';

export async function runDoughSplitDOM(){
  const check=(okay,message)=>{if(!okay)throw new Error(message);};
  const host=document.createElement('div');host.hidden=true;document.body.append(host);
  const e=new CombatEngine({rng:new RNG(21972029),player:{name:'Maya',kid:'maya',companion:'marmalade',hp:77,maxHp:77,energyMax:3,drawPerTurn:0,deck:[]},enemies:[doughBlob]});
  e.registerEnemies([doughBlob,doughling]);e.setTrackerInstaller(installTrackers);
  const events=[];e.on('*',ev=>events.push(ev));await e.startCombat();
  const parentId=e.enemies[0].id;
  const scene=Object.create(CombatScene.prototype);
  scene.engine=e;scene.ctx={};scene.reduceMotion=true;scene.views=new Map();scene.root=host;scene.$enemies=host;
  const view=new EnemyView(e.state.enemies[0],{reduceMotion:true,flashes:0,def:doughBlob});
  host.append(view.el);scene.views.set(parentId,view);
  scene.fx={col:{guard:'guard',threat:'threat',threatHi:'threatHi'},slash(){},burst(){},number(){}};
  scene._impactVeil=()=>{};scene._playerStrike=async()=>{};scene._pointOf=()=>({x:0,y:0});
  scene._numeralSpot=()=>({x:0,y:0,rise:0});scene._addShake=()=>{};scene._syncActor=()=>{};
  scene._renderIncoming=()=>{};scene._wait=async()=>{};scene._d=n=>n;scene._bloomGain=()=>0;
  scene._attachTips=()=>{};
  async function play(id,upgraded=false){const card=new Card(cardById(id),{upgraded});e.piles._push(card,'hand','bottom');check(e.canPlay(card.uid,parentId).ok,`legal ${id}`);await e.playCard(card.uid,parentId);}
  try{
    await play('marmalade/predators-patience',true);await e.endTurn();
    await play('marmalade/fluff-up',true);await play('marmalade/everywhere-at-once');await e.endTurn();
    await play('marmalade/scratch');
    for(const ev of events){
      if(ev.type==='damage'&&ev.targetId===parentId){await scene._animDamage(ev);check(!host.textContent.includes('NaN'),'no NaN between damage and removal');}
      else if(ev.type==='summon'||ev.type==='entity:remove')await scene._animate(ev);
    }
    check(!view.el.isConnected,'Dough Blob removed from DOM');
    check(!scene.views.has(parentId),'Dough Blob removed from selectable views');
    check(scene.views.size===2,'both Doughlings rendered');
    check([...scene.views.values()].every(v=>v.hp===11&&v.alive),'Doughlings alive with real health');
    return {passed:true,rendered:[...scene.views.values()].map(v=>({id:v.id,hp:v.hp})),checks:5};
  }finally{for(const v of scene.views.values())v.destroy();host.remove();}
}
