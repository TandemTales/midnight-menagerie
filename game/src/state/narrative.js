import { Save } from '../core/save.js';
import { storage } from '../core/storage.js';
import { NodeType, COMPANIONS } from '../data/schema.js';
import { NARRATIVE_REGIONS } from '../data/narrative-regions.js';
import { AFTERCARE } from '../data/narrative-aftercare.js';
import { PET_STORIES, PET_DISCOVERIES, OPEN_PET_DISCOVERIES, COMPANION_STORIES, GATE_ENDING, SERVICE_STORIES } from '../data/narrative-relationships.js';

export function storyState() { return Save.data.narrative; }
export function runKey(run) { return `${run.seed}:${run.startedAt}`; }
export function partyKids(run) { return [...new Set(run.kids.map(k => k.kid))]; }
export function petState(kid) {
  return Save.data.petsRescued.includes(kid) ? 'home' : storyState().pets[kid] || 'unknown';
}
export function linesFor(lines, kids) {
  return lines.filter(line => typeof line === 'string' || !PET_STORIES[line.speaker] || kids.includes(line.speaker));
}
// Transactions rollback on refused writes. Storage.flush is awaited by the scene
// before any success copy or navigation. No narrative action consumes run RNG.
let writes = Promise.resolve();
export function commitStory(change) {
  const task = writes.then(async()=>{
    const before = structuredClone(Save.data.narrative), pets = [...Save.data.petsRescued];
    const failures = storage.stats.failures;
    try {
      change(Save.data.narrative, Save.data);
      if (!Save.save()) throw new Error('save refused');
      await Save.flush();
      // An already-running flush may not have included our newly dirtied slot.
      if (storage.dirty.has('mm.save.v1') && storage.stats.failures === failures) await Save.flush();
      if (storage.stats.failures !== failures || storage.dirty.has('mm.save.v1')) throw new Error('write failed');
      return true;
    } catch {
      Save.data.narrative = before; Save.data.petsRescued = pets;
      Save.save(); return false;
    }
  });
  writes=task.catch(()=>{});
  return task;
}
export function markPet(state, data, kid, status) {
  const order = { unknown:0, found:1, home:2 };
  const old = data.petsRescued.includes(kid) ? 'home' : state.pets[kid] || 'unknown';
  if (order[status] > order[old]) state.pets[kid] = status;
  if (status === 'home' && !data.petsRescued.includes(kid)) data.petsRescued.push(kid);
}
function unit(raw, extra = {}) { return { title: raw.title || 'Inside the House', short:!!storyState().seen[raw.id], ...raw, ...extra }; }
function visitRecord(run) { return storyState().runs[runKey(run)] || {}; }
export function runMark(run, key) {
  const id = runKey(run);
  return state => {
    (state.runs[id] ||= {})[key] = true;
    // Keep the active expedition plus a bounded recent history.
    const keys = Object.keys(state.runs);
    for (const old of keys.slice(0, Math.max(0, keys.length - 20))) if (old !== id) delete state.runs[old];
  };
}
export function companionUnit(slug, stage = 0) {
  const lines = COMPANION_STORIES[slug][stage];
  const companion = COMPANIONS.find(c => c.slug === slug);
  return {id:`COMP-${slug}-${stage}`,title:companion.name,lines,recap:lines.join(' ')};
}
function unseenCompanionUnits(slugs) {
  return [...new Set(slugs)].filter(slug=>COMPANION_STORIES[slug] && !storyState().seen[`COMP-${slug}-0`]).map(slug=>companionUnit(slug));
}
export function reunionUnits(kid, ending = false) {
  const p = PET_STORIES[kid];
  if (petState(kid) === 'home') return [];
  const out = [];
  if(!storyState().seen[PET_DISCOVERIES[kid].id] && !storyState().seen[OPEN_PET_DISCOVERIES[kid].id])out.push(ending||storyState().sanctuary?OPEN_PET_DISCOVERIES[kid]:PET_DISCOVERIES[kid]);
  if (petState(kid) === 'found' && !ending) {
    const returns = {
      maya:'Orbit is waiting beside the little door. Maya rests a hand where the black head can bump it.',
      mateo:'Pepper whistles the first half. Mateo whistles the second. Pepper immediately changes the tune.',
      amina:'Amina sits beside the shelf again. This time Mochi comes out before Amina has settled.',
      eli:'Sprocket has collected another screw. Eli offers a sleeve for the usual inspection.',
      priya:'Pixel is on the crooked stone. Priya puts the carrier where Pixel chose it last time.',
      jordan:'One bark. Two huffs. Jordan stops at the doorway and lets Scout cover the last few steps.',
      lena:'Mooncake has added a second room to the museum. Lena examines the new seed collection.',
      samir:'Samir says “Bean.” Bean supplies the second Bean, loudly and in guinea pig.',
    };
    out.push({id:`PET-${kid}-return`,title:p.pet,lines:[returns[kid]],recap:`${p.pet} is still safe. Your reunion has not been lost.`});
  }
  if (petState(kid) === 'unknown') out.push({
    id:`PET-${kid}-found`,title:p.pet,lines:p.reunion,
    recap:`${p.pet} is safe in the House. ${kid[0].toUpperCase()+kid.slice(1)} and ${p.pet} find each other.`,
    change:(s,d) => markPet(s,d,kid,'found'),
  });
  if (ending) out.push({id:`PET-${kid}-home`,title:'The open way',lines:p.home,
    recap:`${p.pet} chooses to leave with ${kid[0].toUpperCase()+kid.slice(1)}. Visiting again is allowed.`,
    change:(s,d)=>markPet(s,d,kid,'home')});
  return out;
}
export function endingUnits(kids) {
  const out = [];
  if (!storyState().seen['HEART-WARD']) out.push({id:'HEART-WARD',title:'Behind the heartbeat',
    lines:['The quiet animal rooms have clean water and warm beds. Their little doors had handles only on the outside.',
      'Old pictures beside the beds show the animals before their shapes changed. Their favorite toys are still beside them.',
      'The Keeper is made from the walls themselves. “I am the part of this House that keeps them safe,” it says. Its hands are still holding the latch.'],
    recap:'The House cares for animals but has kept them from leaving. Changed animals are still themselves. The Keeper is the House’s protective instinct, given a body.'});
  if (!storyState().sanctuary) out.push(unit(GATE_ENDING, {change:s=>{s.sanctuary=true;}}));
  for (const kid of kids) out.push(...reunionUnits(kid,true));
  out.push({id:'END-ONWARD',title:'A light in the window',
    lines:['The House leaves a light in the window. Somewhere inside, a spoon is still trying to rescue another spoon.',
      'There are rooms you have not seen, and friends you have not met. The gate opens both ways.'],
    recap:'The sanctuary is open. Other children can visit peacefully to find their pets. New expeditions revisit the earlier search.',
    change:s=>{s.pendingEnding=null;}});
  return out;
}

export function homecomingMilestone(kids) {
  if(storyState().seen['END-ALL-HOME'])return [];
  const home=new Set([...Save.data.petsRescued,...kids]);
  if(!Object.keys(PET_STORIES).every(k=>home.has(k)))return [];
  return [{id:'END-ALL-HOME',title:'Eight pictures',lines:[
    'The eight missing-pet pictures stay on the board. Under each one, someone writes HOME.',
    'Lena pins a new picture beside them: the open gate. In the corner, a small paw has blurred the photograph.',
    {speaker:'lena',text:'Best bit.'}],recap:'All eight pets are home. The open House is still there to visit.'}];
}

/** Route story beats at real scene boundaries. Never starts or resolves combat. */
export function narrativeRoute(ctx, name, params = {}) {
  if (name === 'narrative' || params.narrativeBypass) return null;
  const run = ctx.run;
  const s = storyState();
  if (['clubhouse','title','gameover'].includes(name) && s.pendingEnding) {
    const matchingRun=run && s.pendingEnding.runId===runKey(run) ? run : null;
    // Ended runs are no longer in the active save. Carry their final reward
    // introductions in the durable ending record, before the gate/reunions.
    // Old records may recover from their matching live run, never another run.
    const freed=Array.isArray(s.pendingEnding.companions) ? s.pendingEnding.companions : matchingRun ? matchingRun.companionsFreed : [];
    const units=[...unseenCompanionUnits(freed),...endingUnits(s.pendingEnding.kids)];
    if(matchingRun)units[units.length-1].runDone='ending';
    return {units,kids:s.pendingEnding.kids,next:{name,params},run:matchingRun};
  }
  if (!run || !NARRATIVE_REGIONS[run.region]) return null;
  const kids = partyKids(run), r = NARRATIVE_REGIONS[run.region], seen = visitRecord(run), units = [];
  // Network simulation must never wait for a client's reading speed. Its full
  // finale is safe after the run ends; optional observations remain in the journal.
  const remote = !!(run.session && run.session.remote);
  const memory = !!run.storyMemory;
  if(!remote && SERVICE_STORIES[name] && !s.seen[SERVICE_STORIES[name].id])units.push(SERVICE_STORIES[name]);
  if (name === 'gameover' && run.result === 'victory' && run.region === 'heart' && !seen.ending) {
    units.push(...unseenCompanionUnits(run.companionsFreed));
    if (!memory) units.push(...endingUnits(kids));
    else units.push({id:'END-MEMORY',title:'Back at the open gate',lines:['The remembered expedition ends. Today, the gate is still open. Your reunions are safe.'],recap:'This expedition revisited the search. It did not undo any reunion.'});
    units[units.length-1].runDone = 'ending';
  } else if (!remote && name === 'map' && !seen[`arrival:${run.region}`]) {
    if (!memory && !seen.search && !s.seen['SEARCH-RECAP']) units.push({id:'SEARCH-RECAP',title:'The search',
      lines:['Eight neighborhood pets are missing. Their traces led to this House.',
        'Your supernatural Companion is helping you search. Your missing pet is someone else.'],
      recap:'Find your missing pet. Your Companion is a different animal, helping with the search.',runDone:'search'});
    if (memory && !seen.memory) units.push({id:'MEMORY-START',title:'An earlier night',lines:['This expedition revisits the search before the gate opened. Today’s sanctuary and every reunion stay safe.'],recap:'This is a remembered expedition. Reunions stay safe.',runDone:'memory'});
    units.push(unit(r.arrival,{title:r.title,short:!!s.seen[r.arrival.id],runDone:`arrival:${run.region}`}));
  } else if (!remote && name === 'combat' && run.currentNode && run.effectiveType(run.currentNode) === NodeType.BOSS && !seen[`before:${run.region}`]) {
    if (run.region === 'heart' && !memory) {
      units.push({id:'HEART-WARD',title:'The room behind the heartbeat',lines:[
        'Warm beds. Clean water. A tiny door with a handle on only one side.',
        'An old picture shows a striped cat with a bent ear. Below it, the cat sleeps with that striped tail over its nose. You can see the cushion through the cat.',
        'A knock sounds from inside one little door. The House adds a cushion instead of opening it.',
        'The Keeper rises from the walls. “I keep them safe,” it says. “That is what I am for.”'],
        recap:'The House cares for animals but will not let them leave. Changed animals are still themselves. The Keeper is the House’s wish to protect, given a body.'});
      for (const kid of kids) units.push(...reunionUnits(kid));
      units.push({id:'HEART-SAFE',title:'Before the Scuffle',lines:['The animals settle in the quiet room behind you. The next Scuffle is with the Keeper. The animals will stay here, safe, whatever happens.'],recap:'Pets are safe outside the battle. A lost expedition cannot take a reunion away.'});
    }
    const investigated=r.beforeIfInvestigated && r.clues.some(c=>c.investigation && s.investigations[c.investigation.id] && s.investigations[c.investigation.id].compared);
    units.push(unit(s.bosses[run.region] && !memory ? r.repeatBefore : investigated ? r.beforeIfInvestigated : r.before,{title:r.boss,runDone:`before:${run.region}`}));
  } else if (!remote && name === 'reward' && run.pendingReward && run.pendingReward.kind === 'boss' && !seen[`after:${run.region}`]) {
    units.push(unit(s.bosses[run.region] && !memory ? r.repeatAfter : AFTERCARE[run.region],{title:r.title,runDone:`after:${run.region}`,change:state=>{state.bosses[run.region]=true;}}));
  }
  if (['map','atlas','gameover'].includes(name) && !remote) {
    for (const u of unseenCompanionUnits(run.companionsFreed)) if(!units.some(existing=>existing.id===u.id))units.push(u);
  }
  return units.length ? {units,kids,next:{name,params},run} : null;
}
