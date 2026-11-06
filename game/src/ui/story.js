import { bus } from '../core/bus.js';
import { Save } from '../core/save.js';
import { KIDS, COMPANIONS } from '../data/schema.js';
import { NARRATIVE_REGIONS } from '../data/narrative-regions.js';
import { PET_STORIES, COMPANION_STORIES, PAIR_STORIES, KID_CHECK_INS } from '../data/narrative-relationships.js';
import { narrativeRoute, storyState, petState, partyKids, runKey, linesFor, commitStory, reunionUnits, companionUnit, homecomingMilestone } from '../state/narrative.js';
import { NarrativeScene, appendStoryLines, storyElement as el } from '../scenes/narrative.js';
import { ensureCss } from './portrait.js';
import { openScuffleHelp } from './scuffle-help.js';
import { Modal } from './modal.js';
import { mountInvestigation } from './investigation.js';

const CSS=new URL('../scenes/narrative.css',import.meta.url).href;
/* Round 61 repair 4: each of these is the boards' dark enamel nameplate with one of the Kid
   board's round enamel buttons seated on its left end (narrative.css .story-tool), its glyph
   struck in gold. The medallion is drawing only: the button's name is still its word. */
const TOOL_GLYPH={
  book:'M2.6 5.1c3.2-1 6.4-.7 8.6.9v14c-2.3-1.5-5.4-1.8-8.6-.9zM21.4 5.1c-3.2-1-6.4-.7-8.6.9v14c2.3-1.5 5.4-1.8 8.6-.9z',
  ask:'M12 .6c4 0 6.9 2.3 6.9 5.9 0 2.7-1.4 4.1-3.6 5.5-1.5 1-2 1.7-2 3v1.3H9.5v-1.8c0-2.2.9-3.4 2.9-4.7 1.6-1 2.2-1.7 2.2-3 0-1.5-1.1-2.5-2.7-2.5-1.8 0-2.9 1.1-3 3.1H4.8C4.9 3.2 7.7.6 12 .6zM11.5 19.2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z',
  voice:'M15.8 1.2c3.6 0 6.4 2.8 6.4 6.4v9.6l-2.1-1.8-2.1 1.8-2.1-1.8-2.1 1.8-2.1-1.8-2.3 1.8V7.6c0-3.6 2.8-6.4 6.4-6.4zM6.6 17.6a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zm-4.8-1.4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z',
};
const toolMedal=(b,d)=>{b.classList.add('story-tool');b.insertAdjacentHTML('afterbegin',`<i class="story-tool__medal" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${d}"/></svg></i>`);return b;};
export function installStory(ctx) {
  ctx.narrativeRoute=(name,params)=>narrativeRoute(ctx,name,params);
  ctx.scenes.register('narrative',c=>new NarrativeScene(c));
  let toolbar=null,dialog=null,dialogKeys=null,battleOff=null,voiceModal=null;
  const clear=()=>{if(toolbar)toolbar.remove();if(dialog)dialog.remove();if(dialogKeys)window.removeEventListener('keydown',dialogKeys,true);if(battleOff)battleOff();if(voiceModal)voiceModal.close();toolbar=null;dialog=null;dialogKeys=null;battleOff=null;voiceModal=null;};
  bus.on('scene:leaving',clear);
  bus.on('run:end',({victory,run})=>{
    if(victory && run.region==='heart' && !storyState().sanctuary) {
      storyState().pendingEnding={kids:partyKids(run),runId:runKey(run),companions:run.companionsFreed.slice()};
      Save.save();
    }
  });
  const openJournal=async()=>{
    await ensureCss(CSS);
    if(dialog)return;
    const back=document.activeElement;
    dialog=el('dialog','','story-dialog');dialog.setAttribute('aria-label','Discoveries');
    const close=el('button','Close discoveries');
    close.onclick=()=>dialog.close();dialog.append(close,el('h2','Discoveries'));
    dialogKeys=e=>{e.stopImmediatePropagation();if(e.key==='Escape'){e.preventDefault();dialog.close();}};
    window.addEventListener('keydown',dialogKeys,true);
    const opened=dialog, ownedKeys=dialogKeys;
    dialog.addEventListener('close',()=>{opened.remove();if(dialog===opened)dialog=null;window.removeEventListener('keydown',ownedKeys,true);if(dialogKeys===ownedKeys)dialogKeys=null;if(back && back.isConnected)back.focus();},{once:true});
    const run=ctx.run, s=storyState(), kids=run?partyKids(run):[];
    const addActions=(parent,id,choices=[])=>{
      for(const choice of choices){
        const previous=s.clues[id] && s.clues[id].actions && s.clues[id].actions[choice.label];
        if(previous){appendStoryLines(parent,previous,kids);continue;}
        const b=el('button',choice.label);parent.append(b);
        b.onclick=async()=>{b.disabled=true;
          const okay=await commitStory(state=>{(state.clues[id].actions ||= {})[choice.label]=linesFor(choice.lines,kids);});
          if(!okay){b.disabled=false;b.textContent='Could not save. Try this examination again.';return;}
          appendStoryLines(parent,choice.lines,kids);b.remove();
        };
      }
    };
    const addObservation=(id,title,lines,detail=[],choices=[],investigation=null)=>{
      const section=el('section','');const button=el('button',title);section.append(button);
      button.onclick=async()=>{
        button.disabled=true;
        const okay=await commitStory(state=>{state.clues[id]={title,lines:linesFor(lines,kids),cast:kids,detail:[]};});
        if(!okay){button.disabled=false;button.textContent='Could not save. Try examining again.';return;}
        appendStoryLines(section,lines,kids);
        if(detail.length){const d=el('details','');d.append(el('summary','Look closer'));appendStoryLines(d,detail,kids);d.addEventListener('toggle',()=>{if(d.open)commitStory(state=>{state.clues[id].detail=linesFor(detail,kids);});});section.append(d);}
        if(investigation)mountInvestigation(section,investigation,kids);else addActions(section,id,choices);
        button.remove();
      };
      dialog.append(section);
    };
    if(run && !run.result && NARRATIVE_REGIONS[run.region]) {
      const region=NARRATIVE_REGIONS[run.region];dialog.append(el('p',`Around ${region.title}`));
      const count=run.visitedIds.length;
      region.clues.forEach((clue,i)=>{
        if(count>=i*3 && !s.clues[clue.id] && !(clue.beforeResolutionOnly && s.bosses[run.region] && !run.storyMemory))addObservation(clue.id,clue.title,clue.lines,clue.detail,clue.detailChoices,clue.investigation);
      });
      // Evidence is a trace, not a random Clue reward or a rescue claim.
      if(!s.sanctuary)for(const kid of kids){const p=PET_STORIES[kid],id=`PET-${kid}-trace`;
        if(petState(kid)==='unknown'&&!s.clues[id])addObservation(id,`A small trace — ${p.pet}`,p.trace,p.closer);
      }
    }
    if(ctx.scenes.currentName==='rest' && run) {
      const conversations=el('section','','story-conversations');
      for(const kid of kids) {
        const id=`KID-${kid}-rest`,stage=s.seen[id+'-0']?1:0;
        if((petState(kid)==='unknown' || run.storyMemory) && !s.seen[id+'-'+stage] && (stage===0 || Object.keys(s.bosses).length)) {
          const b=el('button',`A quiet moment with ${KIDS.find(k=>k.slug===kid).name.split(' ')[0]}`);
          b.onclick=async()=>{appendStoryLines(conversations,KID_CHECK_INS[kid][stage],kids);b.remove();await commitStory(state=>{state.seen[id+'-'+stage]=true;});};conversations.append(b);
        }
      }
      for(const pair of PAIR_STORIES)if(pair.kids.every(k=>kids.includes(k))) {
        const id=`PAIR-${pair.kids.join('-')}`,stage=s.seen[id+'-0']?1:0;
        if(!s.seen[id+'-'+stage]){const b=el('button',pair.title);b.onclick=async()=>{appendStoryLines(conversations,pair.scenes[stage],kids);b.remove();await commitStory(state=>{state.seen[id+'-'+stage]=true;});};conversations.append(b);}
      }
      for(const slug of [...new Set(run.kids.map(k=>k.companion))]) {
        const u=companionUnit(slug,1);const b=el('button',`Sit with ${COMPANIONS.find(c=>c.slug===slug).name}`);
        if(s.seen[u.id])continue;
        b.onclick=async()=>{appendStoryLines(conversations,u.lines,kids);b.remove();await commitStory(state=>{state.seen[u.id]=true;});};conversations.append(b);
      }
      if(conversations.childElementCount){conversations.prepend(el('h2','A moment together'),el('p','These conversations do not spend Clues or use a fort action.'));dialog.append(conversations);}
    }
    for(const [id,c] of Object.entries(s.clues)) {
      const d=el('details','');d.dataset.clue=id;d.append(el('summary',c.title));
      d.append(el('p','Recorded on an earlier look.'));appendStoryLines(d,c.lines,c.cast||kids);
      if(c.detail.length){const inner=el('details','');inner.append(el('summary','Look closer at the record'));appendStoryLines(inner,c.detail,c.cast||kids);d.append(inner);}
      else if(run && !run.result) {
        const region=NARRATIVE_REGIONS[run.region];
        const authored=region && region.clues.find(x=>x.id===id && !(x.beforeResolutionOnly && s.bosses[run.region] && !run.storyMemory));
        const pet=kids.find(k=>id===`PET-${k}-trace` && petState(k)==='unknown' && !s.sanctuary);
        const detail=authored?authored.detail:pet?PET_STORIES[pet].closer:[];
        if(detail.length){const inner=el('details','');inner.append(el('summary','Examine it more closely here'));appendStoryLines(inner,detail,kids);inner.addEventListener('toggle',()=>{if(inner.open)commitStory(state=>{state.clues[id].detail=linesFor(detail,kids);});});d.append(inner);}
      }
      const current=run && !run.result && NARRATIVE_REGIONS[run.region] && NARRATIVE_REGIONS[run.region].clues.find(x=>x.id===id && !(x.beforeResolutionOnly && s.bosses[run.region] && !run.storyMemory));
      if(current && current.investigation)mountInvestigation(d,current.investigation,kids);
      else if(current)addActions(d,id,current.detailChoices);
      else if(c.actions)for(const lines of Object.values(c.actions))appendStoryLines(d,lines,kids);
      if(!current)for(const region of Object.values(NARRATIVE_REGIONS)){const old=region.clues.find(c=>c.id===id&&c.investigation);if(old)mountInvestigation(d,old.investigation,kids,{historical:true});}
      dialog.append(d);
    }
    if(!Object.keys(s.clues).length)dialog.append(el('p','Your observations stay here between expeditions. There is no timer.'));
    for(const choice of Object.values(s.choices)) {
      const record=el('details','');record.append(el('summary',choice.label),el('p',choice.memory?'From an earlier-night expedition.':'An action you took.'),el('p',choice.recap));dialog.append(record);
    }
    if(ctx.scenes.currentName==='clubhouse' && s.sanctuary) {
      const visits=el('section','','story-visits');
      visits.append(el('h2','Visit the open House'));
      visits.append(el('p','A peaceful visit today. These visits do not start a Scuffle.'));
      for(const kid of KIDS) {
        const home=petState(kid.slug)==='home',p=PET_STORIES[kid.slug];
        const b=el('button',home?`${p.pet} — home`:`Visit with ${kid.name.split(' ')[0]}`);b.disabled=home;
        b.onclick=()=>{
          dialog.close();ctx.scenes.go('narrative',{units:[...reunionUnits(kid.slug,true),...homecomingMilestone([kid.slug])],kids:[kid.slug],next:{name:'clubhouse',params:{}}});
        };visits.append(b);
      }
      for(const slug of [...new Set(['marmalade',...Save.data.companionsRescued])]) {
        if(!COMPANION_STORIES[slug])continue;
        const c=COMPANIONS.find(x=>x.slug===slug), b=el('button',`Visit ${c.name}`);
        b.onclick=async()=>{
          if(!s.seen[`COMP-${slug}-1`])appendStoryLines(visits,companionUnit(slug,1).lines,[]);
          appendStoryLines(visits,companionUnit(slug,2).lines,[]);b.remove();
          await commitStory(state=>{state.seen[`COMP-${slug}-1`]=true;state.seen[`COMP-${slug}-2`]=true;});
        };visits.append(b);
      }
      // Present today's available actions before the cumulative archive.
      dialog.insertBefore(visits,dialog.querySelector(':scope > details'));
    }
    document.body.append(dialog);dialog.showModal();close.focus();
  };
  bus.on('scene:entered',async({name})=>{
    if(!['map','atlas','clubhouse','rest','combat'].includes(name))return;
    const scene=ctx.scenes.current;
    await ensureCss(CSS);
    if(ctx.scenes.current!==scene)return;
    toolbar=el('nav','','story-tools');toolbar.setAttribute('aria-label','Story and help');
    if(name!=='combat'){const b=toolMedal(el('button','Discoveries'),TOOL_GLYPH.book);b.onclick=openJournal;toolbar.append(b);}
    const help=toolMedal(el('button','How to play'),TOOL_GLYPH.ask);help.onclick=()=>openScuffleHelp(ctx);toolbar.append(help);
    if(name==='combat' && ctx.run && ctx.scenes.current.arena==='boss') {
      const r=NARRATIVE_REGIONS[ctx.run.region], u=r && r.barks[0], engine=ctx.scenes.current.engine;
      if(u) {
        const voice=toolMedal(el('button','Guardian voice'),TOOL_GLYPH.voice);voice.disabled=true;toolbar.append(voice);
        let enemyMoved=false;
        battleOff=engine.on('phase',ev=>{if(ev.phase==='enemy')enemyMoved=true;if(enemyMoved&&ev.phase==='player')voice.disabled=false;});
        voice.onclick=()=>{
          voiceModal=new Modal({title:r.boss,host:ctx.dom});
          appendStoryLines(voiceModal.body,u.lines,partyKids(ctx.run));
          const close=el('button','Back to the Scuffle');close.onclick=()=>voiceModal.close();voiceModal.footer.append(close);voiceModal.open();
        };
      }
    }
    ctx.scenes.current.root.append(toolbar);
  });
  return clear;
}
