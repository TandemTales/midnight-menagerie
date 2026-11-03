import { Scene } from '../core/scenes.js';
import { KIDS, COMPANIONS } from '../data/schema.js';
import { ensureCss, heroSrc } from '../ui/portrait.js';
import { kitButton } from '../ui/modal.js';
import { commitStory, linesFor, runMark } from '../state/narrative.js';

const CSS = new URL('./narrative.css', import.meta.url).href;
const KIT = new URL('../ui/kit.css', import.meta.url).href;
export function storyElement(tag, text, className = '') {
  const el = document.createElement(tag); el.textContent = text; el.className = className; return el;
}
export function appendStoryLines(parent, lines, kids) {
  for (const line of linesFor(lines, kids)) {
    const p = storyElement('p','');
    if (typeof line === 'string') p.textContent = line;
    else {
      const kid = KIDS.find(k=>k.slug===line.speaker);
      if (line.speaker !== 'narrator') p.append(storyElement('strong',`${kid ? kid.name.split(' ')[0] : line.speaker}: `));
      p.append(document.createTextNode(line.text));
    }
    parent.append(p);
  }
}
export class NarrativeScene extends Scene {
  async enter(params) {
    this.params = params; this.index = 0; this.short = !!params.units[0].short; this.dead = false; this.choice=null;
    await Promise.all([ensureCss(KIT), ensureCss(CSS)]);
    // Like the original tutorial, the story stands inside the authored room.
    this.ctx.stage?.setPaused(false);
    this.ctx.atmosphere?.setMood(params.run?.region || 'foyer');
    if (!this.dead) this.render();
  }
  render() {
    const u = this.params.units[this.index];
    this.root.replaceChildren();
    const dress = storyElement('div','','story-dress kit-dress');
    dress.setAttribute('aria-hidden','true');
    dress.innerHTML = '<div class="kit-dress__rule"></div><div class="kit-dress__vine kit-dress__vine--l"></div><div class="kit-dress__vine kit-dress__vine--r"></div><div class="kit-dress__corner kit-dress__corner--l"></div><div class="kit-dress__corner kit-dress__corner--r"></div><div class="kit-dress__flame kit-dress__flame--l"></div><div class="kit-dress__flame kit-dress__flame--r"></div>';
    const stage = storyElement('div','','story-stage');
    // An introduction shows its own Companion; other scenes show the party's
    // current Companion. Never reveal an unavailable Companion as decoration.
    const introduced = COMPANIONS.find(c=>u.id.startsWith(`COMP-${c.slug}-`));
    const companion = introduced || COMPANIONS.find(c=>c.slug===this.params.run?.kids[0]?.companion);
    if (companion) stage.append(this.portrait(companion));
    else stage.classList.add('story-stage--solo');
    const page = storyElement('article','','story-page kit-panel kit-panel--damask');
    page.dataset.medal='moon';
    page.setAttribute('aria-label','Story');
    page.append(storyElement('div',`${this.index+1} / ${this.params.units.length}`,'story-progress'));
    const heading = storyElement('h1',u.title); heading.tabIndex=-1; page.append(heading);
    const body = storyElement('div','','story-body');
    const showing=this.choice || u;
    appendStoryLines(body,this.short?[showing.recap]:showing.lines,this.params.kids);
    page.append(body);
    const controls = storyElement('div','','story-controls');
    if (!this.short) {
      const short = storyElement('button','Short version');
      short.onclick=()=>{this.short=true;this.render();}; controls.append(short);
    } else {
      const full = storyElement('button','Read full scene');
      full.onclick=()=>{this.short=false;this.render();}; controls.append(full);
    }
    if(u.choices && !this.choice) {
      const choices=storyElement('div','','story-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label','What will you do?');
      for(const choice of u.choices){const b=storyElement('button',choice.label);b.dataset.choice=choice.id;b.onclick=()=>{this.choice=choice;this.render();};choices.append(b);}
      page.append(choices);
    } else {
      const next = storyElement('button',this.index+1===this.params.units.length?'Continue':'Next');
      next.onclick=()=>this.advance(next); controls.append(next);
    }
    this.status=storyElement('p','','story-status');this.status.setAttribute('role','status');
    page.append(controls,this.status);
    for (const button of page.querySelectorAll('button')) {
      button.type='button';kitButton(button);
    }
    stage.append(page);
    const mantel=storyElement('div','','story-mantel kit-shelf-rail');
    mantel.setAttribute('aria-hidden','true');stage.append(mantel);
    this.root.append(dress,stage);heading.focus();
  }
  portrait(companion) {
    const figure=storyElement('figure','','story-portrait');
    const frame=storyElement('div','','story-frame kit-frame kit-frame--over');
    const img=document.createElement('img');
    img.src=heroSrc(companion.slug);img.alt='';img.decoding='async';img.draggable=false;
    frame.append(img);
    const plate=storyElement('figcaption','','story-plate kit-plate kit-plate--arch');
    plate.append(storyElement('span',companion.name,'kit-plate__name'),storyElement('span',companion.title,'kit-plate__epithet'));
    const candle=storyElement('i','','story-candle kit-prop kit-prop--candle');
    candle.setAttribute('aria-hidden','true');
    figure.append(frame,plate,candle);return figure;
  }
  async advance(button) {
    if (this.saving || this.ctx.scenes.busy) return;
    this.saving=true;button.disabled=true;
    const u=this.params.units[this.index];
    if(u.choices && !this.choice){this.saving=false;button.disabled=false;return;}
    const ok=await commitStory((s,d)=>{
      s.seen[u.id]=true;
      if(this.choice)s.choices[u.id]={id:this.choice.id,label:this.choice.label,recap:this.choice.recap,memory:!!(this.params.run&&this.params.run.storyMemory)};
      if(u.change)u.change(s,d);
      if(u.runDone && this.params.run)runMark(this.params.run,u.runDone)(s);
    });
    this.saving=false;
    if(this.dead)return;
    if(!ok){button.disabled=false;this.status.textContent='Your progress could not be saved. Please try Continue again. This scene will wait.';return;}
    this.index++;this.choice=null;this.short=!!(this.params.units[this.index] && this.params.units[this.index].short);
    if(this.index<this.params.units.length)this.render();
    else {
      const next=this.params.next;
      this.ctx.scenes.go(next.name,{...next.params,narrativeBypass:true});
    }
  }
  async exit(){this.dead=true;}
}
