import fs from 'node:fs';
import vm from 'node:vm';
import {NARRATIVE_REGIONS} from '../../game/src/data/narrative-regions.js';
import {AFTERCARE} from '../../game/src/data/narrative-aftercare.js';
import {PET_STORIES,PET_DISCOVERIES,OPEN_PET_DISCOVERIES,COMPANION_STORIES,PAIR_STORIES,KID_CHECK_INS,SERVICE_STORIES,GATE_ENDING} from '../../game/src/data/narrative-relationships.js';
import {reunionUnits,endingUnits,narrativeRoute,homecomingMilestone} from '../../game/src/state/narrative.js';
import {Save} from '../../game/src/core/save.js';
import {KIDS,COMPANIONS,NodeType} from '../../game/src/data/schema.js';
import {CURIOSITIES} from '../../game/src/data/events.js';
// RestScene imports browser-only THREE infrastructure. Read only its authored
// object literal in an isolated VM; do not copy or relocate runtime data.
const restSource=fs.readFileSync(new URL('../../game/src/scenes/rest.js',import.meta.url),'utf8');
const repeatMatch=restSource.match(/export const REPEAT_COMPANION_TALK = (\{[\s\S]*?\r?\n\});/);
if(!repeatMatch)throw new Error('Repeat Companion caption export not found');
const repeatCaptions=vm.runInNewContext(`(${repeatMatch[1]})`,Object.create(null),{timeout:1000});
if(COMPANIONS.length!==Object.keys(repeatCaptions).length || COMPANIONS.some(c=>!Array.isArray(repeatCaptions[c.slug]) || repeatCaptions[c.slug].length!==3 || repeatCaptions[c.slug].some(line=>typeof line!=='string')))
  throw new Error('Repeat caption coverage changed; review documentation contract');
if(!restSource.includes('return lines[(run.regionIndex + priorForts) % lines.length];'))
  throw new Error('Repeat selection rule changed; review documentation contract');
const companionName=slug=>{const c=COMPANIONS.find(c=>c.slug===slug);if(!c)throw new Error(`Unknown Companion ${slug}`);return c.name;};
const out=['# Exact runtime script — implemented edition','',
 'Generated from executable data. This edition supersedes overlapping older proposal text. Shared location, trigger, prerequisites, state, choice, replay, fallback and staging contracts are in section 10. Captions are actual player-facing text; Kid dialogue is filtered to the present cast. No new animation is implied. All material is newly authored for this game; inherited canon versus chosen implementation is recorded in the source ledger.',''];
const lines=(items)=>{for(const line of items){const kid=typeof line==='object'&&KIDS.find(k=>k.slug===line.speaker);out.push(typeof line==='string'?line:line.speaker==='narrator'?line.text:`**${kid?kid.name.split(' ')[0]:line.speaker}:** ${line.text}`,'');}};
const unit=(u,meta='')=>{
  out.push(`### ${u.id} — ${u.title||'Scene'}`,'');
  if(meta)out.push(meta,'');
  const words=JSON.stringify(u.lines).split(/\s+/).length;
  out.push(`Reading estimate: ${Math.max(8,Math.ceil(words/2.2))} seconds, self-paced. ${u.choices?'Short version retains every action; only the chosen outcome is shown.':'Short version preserves required facts.'}`,'');
  lines(u.lines);if(u.recap)out.push(`**Short version:** ${u.recap}`,'');
  for(const c of u.choices||[]){out.push(`#### ${c.id} — ${c.label}`,'');lines(c.lines);out.push(`**Short outcome:** ${c.recap}`,'');}
};
for(const [slug,r]of Object.entries(NARRATIVE_REGIONS)){
  out.push(`## ${r.title} — ${slug}`,'');
  for(const key of ['arrival','before','beforeIfInvestigated'])if(r[key])unit({...r[key],title:key==='arrival'?r.title:r.boss},`Trigger: ${key}; actual region ${slug}.`);
  unit({...AFTERCARE[slug],title:r.title},`Trigger: first real boss reward. Combat is already won. Choice changes narrative outcome record, not rewards. All branches preserve the same local promise.`);
  for(const key of ['repeatBefore','repeatAfter'])unit({...r[key],title:r.title},`Trigger: ${key}; previous local resolution, current search. Earlier-night replay uses first scene with short default.`);
  for(const c of r.clues){unit(c,`Optional observation in ${slug}; ${c.beforeResolutionOnly?'a pre-resolution restriction, unavailable fresh after that promise changes except in earlier-night replay':'available while exploring'}.`);out.push('**Look closer:**','');lines(c.detail);
    if(c.investigation){const i=c.investigation;out.push(`#### ${i.id} — ${i.title}`, '',i.question,'','**Optional ideas — no default, penalty or answer required:**','');for(const h of i.hypotheses)out.push(`- ${h.id}: ${h.label}`);out.push('');for(const t of i.tests){out.push(`**${t.id} — ${t.label}**`,'');lines(t.lines);}out.push('**Put the observations together:**','');lines(i.resolution.lines);}
    else for(const c2 of c.detailChoices||[]){out.push(`**${c2.id} — ${c2.label}**`,'');lines(c2.lines);}
  }
  for(const bark of r.barks)unit({...bark,title:r.boss},'Optional Guardian voice, available after an enemy phase. No timed reading or tactical promise.');
}
out.push('## Personal investigations and reunions','');
for(const [kid,p]of Object.entries(PET_STORIES)){
  unit({id:`PET-${kid}-trace`,title:p.pet,lines:p.trace},'Unknown pet; matching present Kid; current search. This observation does not change the pet to found.');out.push('**Look closer:**','');lines(p.closer);
  unit(PET_DISCOVERIES[kid],'First Heart approach, before sanctuary. Pays off this Kid’s opening disappearance evidence.');
  unit(OPEN_PET_DISCOVERIES[kid],'Peaceful sanctuary discovery or post-gate first reunion. Current exits are open; old obstacles are not restored.');
  Save.data.narrative.pets[kid]='unknown';
  unit(reunionUnits(kid).find(u=>u.id===`PET-${kid}-found`),'Unknown→found only after display/recap and durable commit.');
  Save.data.narrative.pets[kid]='found';
  const repeat=reunionUnits(kid).find(u=>u.id===`PET-${kid}-return`);if(repeat)unit(repeat,'Already found, not home; returns after a failed expedition do not undo reunion.');
  unit(reunionUnits(kid,true).find(u=>u.id===`PET-${kid}-home`),'Voluntary departure after open gate; found→home and existing petsRescued record.');
}
out.push('## Companion relationships','');
for(const[slug,stages]of Object.entries(COMPANION_STORIES))stages.forEach((ls,i)=>unit({id:`COMP-${slug}-${i}`,title:companionName(slug),lines:ls,recap:ls.join(' ')},['Actual rescue; opening supplies Marmalade’s first meeting.','Present Companion, first safe-room moment, available through a free journal conversation or the paid Sit action. Later paid sits use the Companion-specific repeat captions below.','Available Companion at sanctuary; present B first if unseen.'][i]));
out.push('## Repeat Safe Room Companion captions','',
 'These exact captions appear after the paid **Sit with your Companion** action when COMP-<slug>-1 is already seen. The active local Companion supplies the bank. A prior free journal conversation also sets that seen milestone. If the milestone is unseen, paid Sit uses the first stage-one caption above unchanged. Paid Sit still consumes the one fort action and awards one Clue; free journal conversations spend neither Clues nor a fort action.','',
 'Selection: zero-based caption index = (run.regionIndex + priorForts) % 3. priorForts counts resolved nodes in the current wing’s visitedIds whose effective type is Safe Room, excluding currentNodeId. The existing region index is zero-based. This rule adds no RNG draw or save flag. Successive Safe Rooms in one wing cycle through the bank; immediate nonrepetition across wing changes or new expeditions is not guaranteed.','',
 'Each DOC-REST-REPEAT identifier below is a stable documentation ID, not an implemented state flag or selectable story branch. Location: Safe Room result status text. Speaker/staging: narrator caption beside the existing Companion affection clip; no new art or animation. Trigger: paid Sit after stage one is seen. Consequences: the existing +1 Clue and fort-action lock only. No Short version control applies to this short result caption; players may choose another fort action or leave. Unknown unsupported Companion slugs use the defensive caption “Your Companion settles beside the blanket.” All sixteen current Companions have their own bank.','');
for(const companion of COMPANIONS)repeatCaptions[companion.slug].forEach((text,i)=>{
 out.push(`### DOC-REST-REPEAT-${companion.slug}-${i+1} — ${companion.name}`,'',`Bank index: ${i}. Canon status: implemented current caption.`,'');
 lines([text]);
});
out.push('## Pair scenes and solo check-ins','');
for(const p of PAIR_STORIES)p.scenes.forEach((ls,i)=>unit({id:`PAIR-${p.kids.join('-')}-${i}`,title:p.title,lines:ls},`Both Kids present. ${i?'Requires earlier pair scene.':'First optional safe-room conversation.'}`));
for(const[kid,stages]of Object.entries(KID_CHECK_INS))stages.forEach((ls,i)=>unit({id:`KID-${kid}-rest-${i}`,title:kid,lines:ls},`Matching present Kid, unknown-pet search or earlier-night replay. ${i?'Prior check-in and resolved guardian required.':'First check-in.'}`));
out.push('## Services and the final gate','');for(const u of Object.values(SERVICE_STORIES))unit(u,'First actual matching service entry; no mechanical choice is consumed.');unit(GATE_ENDING,'First real Heart victory, after guardians. Chosen gate outcome must be displayed/recapped and durably saved before sanctuary changes.');
out.push('## Essential carriers and ending variations','');
const stub={seed:1,startedAt:0,kids:[{kid:'maya'}],region:'foyer',companionsFreed:[],storyMemory:false};
for(const u of narrativeRoute({run:stub},'map',{}).units.filter(u=>!u.id.startsWith('NR-')))unit(u);
stub.region='heart';stub.currentNode={};stub.effectiveType=()=>NodeType.BOSS;
for(const u of narrativeRoute({run:stub},'combat',{}).units.filter(u=>u.id.startsWith('HEART-')))unit(u);
stub.region='foyer';stub.storyMemory=true;
for(const u of narrativeRoute({run:stub},'map',{}).units.filter(u=>u.id==='MEMORY-START'))unit(u);
stub.region='heart';stub.result='victory';for(const u of narrativeRoute({run:stub},'gameover',{}).units)unit(u);
for(const u of endingUnits(['maya']).filter(u=>u.id==='END-ONWARD'))unit(u);
for(const u of homecomingMilestone(Object.keys(PET_STORIES)))unit(u);
out.push('## Existing Curiosities — revised executable text','');
for(const e of CURIOSITIES){unit({id:`EVENT-${e.id}`,title:e.name,lines:e.text},`Curiosity: ${e.room}. Effects, weights and equipment gates are unchanged.`);
 for(const option of e.options){out.push(`#### EVENT-${e.id}-${option.id} — ${option.label}`,'',`Risk: ${option.risk||'None stated'}. Reward: ${option.reward||'None stated'}.`,'');if(option.gateText)out.push(`Equipment gate: ${option.gateText}`,'');for(const [i,result]of(option.outcomes||[]).entries())unit({id:`EVENT-${e.id}-${option.id}-${i+1}`,title:result.title,lines:[result.text]},'Only the actual weighted outcome is displayed. The tuple identifies this existing outcome; it is not a new game-state flag.');}
}
fs.writeFileSync(new URL('./11-runtime-player-script.md',import.meta.url),out.join('\n'));
console.log(`Wrote exact runtime script: ${out.join('\n').split(/\s+/).length} words.`);
