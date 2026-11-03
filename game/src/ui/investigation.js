import { commitStory, storyState, linesFor } from '../state/narrative.js';
import { storyElement as el, appendStoryLines } from '../scenes/narrative.js';

/** Optional, untimed observations. Guesses never gate progress or grant currency. */
export function mountInvestigation(parent, definition, kids, { historical=false }={}) {
  const root=el('section','','story-case');root.dataset.investigation=definition.id;parent.append(root);
  let working=false;
  const record=()=>storyState().investigations[definition.id] || {tests:{},hypothesis:null,compared:false};
  const write=async(change)=>{
    if(working)return false;working=true;
    const okay=await commitStory(s=>{
      const r=(s.investigations[definition.id] ||= {tests:{},hypothesis:null,compared:false});change(r);
    });working=false;
    if(!okay){const status=el('p','That observation could not be saved. Please try again.');status.setAttribute('role','status');root.append(status);}
    return okay;
  };
  const render=(focusId=null)=>{
    const r=record();root.replaceChildren();root.append(el('h3',definition.title),el('p',definition.question));
    if(historical) {
      if(r.hypothesis){const h=definition.hypotheses.find(h=>h.id===r.hypothesis);root.append(el('p',`Your recorded idea: ${h.label}`));}
    } else {
      const ideas=el('fieldset','');ideas.append(el('legend','My idea — optional. You can change it.'));
      for(const h of definition.hypotheses){const b=el('button',h.label);b.dataset.focus=h.id;b.setAttribute('aria-pressed',String(r.hypothesis===h.id));
        b.onclick=async()=>{b.disabled=true;if(await write(v=>{v.hypothesis=h.id;}))render(h.id);else b.disabled=false;};ideas.append(b);}
      root.append(ideas);
    }
    for(const test of definition.tests){
      const section=el('section','');section.dataset.focus=test.id;section.tabIndex=-1;
      if(r.tests[test.id]){section.append(el('h4',test.label));appendStoryLines(section,r.tests[test.id],kids);}
      else if(!historical){const b=el('button',test.label);b.onclick=async()=>{b.disabled=true;if(await write(v=>{v.tests[test.id]=linesFor(test.lines,kids);}))render(test.id);else b.disabled=false;};section.append(b);}
      root.append(section);
    }
    if(r.compared) {
      const heading=el('h4','What happened');heading.dataset.focus='compared';heading.tabIndex=-1;root.append(heading);appendStoryLines(root,definition.resolution.lines,kids);
    } else if(!historical) {
      const ready=definition.tests.every(t=>r.tests[t.id]);
      const compare=el('button','Put the observations together');compare.disabled=!ready;
      if(!ready)root.append(el('p','Try the checks above first. There is no time limit.'));
      compare.onclick=async()=>{compare.disabled=true;if(await write(v=>{v.compared=true;}))render('compared');else compare.disabled=false;};root.append(compare);
    }
    if(focusId){const target=[...root.querySelectorAll('[data-focus]')].find(el=>el.dataset.focus===focusId);if(target)target.focus();}
  };
  render();return root;
}
