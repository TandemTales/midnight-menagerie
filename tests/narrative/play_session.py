"""Interactive browser-session recorder. Uses real UI; never edits game state.

Loaded into the isolated Playwright REPL for the six-wing narrative audit.
The operator chooses actions from observed controls. JSONL preserves the route,
visible text and read-only run state so a fixture cannot be called a playthrough.
"""
from pathlib import Path
import json, time
import re

PLAY_OUT = Path('docs/ingame-narrative-2026-10-27/reviews/six-wing-playthrough')
PLAY_OUT.mkdir(parents=True, exist_ok=True)

def snap(label='read', shot=False):
    # Read-only export of the isolated profile's existing browser storage.
    # This is a recovery artifact, never an engine grant or scene shortcut.
    page.context.storage_state(path=str(PLAY_OUT/'latest-browser-save.json'))
    text = page.locator('body').inner_text()
    state = page.evaluate('''() => {
      const m=window.MM;if(!m)return null;const r=m.ctx.run;
      return {scene:m.ctx.scenes.currentName,busy:m.ctx.scenes.busy,
        run:r?{seed:r.seed,region:r.region,wing:r.wing,currentNodeId:r.currentNodeId,
          result:r.result,kids:r.kids.map(k=>({kid:k.kid,courage:k.courage,max:k.maxCourage,deck:k.deck.length}))}:null,
        narrative:m.Save.data.narrative};
    }''')
    row={'time':time.time(),'label':label,'state':state,'text':text}
    with (PLAY_OUT/'session.jsonl').open('a',encoding='utf-8') as f:
        f.write(json.dumps(row,ensure_ascii=False)+'\n')
    if shot: page.screenshot(path=str(PLAY_OUT/(label+'.png')))
    dialog=page.locator('dialog[open]')
    if dialog.count(): print(dialog.inner_text())
    elif state and state['scene']=='map':
        print(page.locator('.map-node.is-legal').evaluate_all('(es)=>es.map(e=>e.getAttribute("aria-label"))'))
    else: print(text)
    print('STATE',json.dumps({k:state[k] for k in ('scene','busy','run')} if state else None,ensure_ascii=False))

def buttons():
    root=page.locator('dialog[open]') if page.locator('dialog[open]').count() else page
    print(root.locator('button:visible,[role=button]:visible').evaluate_all(
        '(els)=>els.map(e=>({text:e.innerText,label:e.getAttribute("aria-label"),disabled:e.disabled,cls:e.className}))'))

def click(name):
    page.get_by_role('button',name=name,exact=True).click()
    print('CLICK',name)

def record_action(action):
    with (PLAY_OUT/'actions.jsonl').open('a',encoding='utf-8') as f:
        f.write(json.dumps({'time':time.time(),'action':action})+'\n')

def ready():
    page.wait_for_function('''()=>{
      const s=MM.ctx.scenes;if(s.busy)return false;
      if(s.currentName!=='combat')return true;
      const end=document.querySelector('#end-turn');
      return !s.current._resolving&&s.current.engine.phase==='player'&&end&&!end.disabled&&!s.current.hand.locked;
    }''',timeout=45000)

def hand():
    ready()
    print(page.evaluate('''()=>{
      const s=MM.ctx.scenes.current;
      return {energy:s.me.energy,hp:s.me.hp,block:s.me.block,
        cards:s.hand.slots.map((x,i)=>({key:i+1,uid:x.card.uid,name:x.card.def.name,
          text:x.view.el.innerText,playable:x.playable})),
        enemies:[...document.querySelectorAll('.cb-enemy')].map(e=>e.innerText)};
    }'''))

def play(key, target=0):
    ready()
    record_action({'key':key,'targetIndex':target})
    page.locator('.mm-hand').focus()
    page.keyboard.press('ArrowDown')
    page.keyboard.press(str(key))
    page.keyboard.press('ArrowUp')
    if page.evaluate('!!MM.ctx.scenes.current.hand.aim'):
        for _ in range(target): page.keyboard.press('ArrowRight')
        page.keyboard.press('ArrowUp')
    ready()

def end():
    record_action('End Turn')
    page.locator('#end-turn').click()
    ready()

def leave_reward(pick='Take none'):
    """Choose the requested visible reward and return via the normal button."""
    page.get_by_role('button',name=re.compile('^'+re.escape(pick),re.I)).click()
    page.locator('.rm-go').click()
    page.wait_for_selector('.map-node.is-legal',timeout=30000)
    ready();snap('next-map')

def sharpen(name):
    page.get_by_role('button',name=re.compile('Sharpen a Trick',re.I)).click()
    page.get_by_role('button',name=re.compile('^'+re.escape(name)+r'(?: plus)?,',re.I)).click()
    chosen=page.locator('.rm-picker__read').inner_text()
    print(chosen);record_action({'upgradeSelection':chosen})
    assert chosen.startswith('Selected: '+name+'.'),chosen
    page.get_by_role('button',name=re.compile('^Sharpen it$',re.I)).click()
    snap('upgrade-confirmed')
    page.locator('.rm-go').click()
    page.wait_for_selector('.map-node.is-legal',timeout=30000)

def enter_room(label=None):
    """Use a visible legal map node; stop on story, events and boss introductions."""
    ready()
    nodes=page.locator('.map-node.is-legal')
    if label:
        labels=nodes.evaluate_all('(es)=>es.map(e=>e.getAttribute("aria-label"))')
        index=next(i for i,x in enumerate(labels) if label.lower() in x.lower())
    else:
        labels=nodes.evaluate_all('(es)=>es.map(e=>e.getAttribute("aria-label"))')
        priorities=['Rescue','Safe Room','Curiosity','Treasure',"Mr. Moth's",'Unsurveyed','Scuffle','Big Scare']
        index=min(range(len(labels)),key=lambda i:next((n for n,s in enumerate(priorities) if s.lower() in labels[i].lower()),len(priorities)))
    record_action({'room':nodes.nth(index).get_attribute('aria-label')})
    nodes.nth(index).click()
    page.wait_for_function("MM.ctx.scenes.currentName!=='map' && !MM.ctx.scenes.busy",timeout=30000)
    ready()
    if page.evaluate('MM.ctx.scenes.currentName')=='combat':fight(12)
    else:snap('entered-room')

def board():
    """Read the current visible hand/telegraphs. No simulation or future draws."""
    return page.evaluate('''()=>{
      const s=MM.ctx.scenes.current;
      return {turn:s.engine.turn,hp:s.me.hp,block:s.me.block,energy:s.me.energy,visible:document.body.innerText,
        conditions:[...document.querySelectorAll('.cb-statuses [aria-label]')].map(e=>e.getAttribute('aria-label')),
        cards:s.hand.slots.map((x,i)=>({key:i+1,uid:x.card.uid,name:x.card.def.name,
          text:x.view.el.getAttribute('aria-label'),playable:x.playable})),
        enemies:[...document.querySelectorAll('.cb-enemy')].filter(e=>!e.classList.contains('is-dead')).map(e=>e.getAttribute('aria-label'))};
    }''')

def fight(turn_limit=6):
    """Repetitive combat input through keyboard; stops for scenes/unknown choices.

    A small transparent tactic ranks only displayed damage, Guard and Haunt.
    It does not call playCard/endTurn, alter health/decks, or force victories.
    The operator handles novel cards, rewards, route and narrative choices.
    """
    for _ in range(turn_limit):
        ready()
        if page.evaluate('MM.ctx.scenes.currentName')!='combat':
            snap('battle-finished');return
        b=board();record_action({'turn':b['turn'],'courage':b['hp'],'enemies':b['enemies']})
        print('TURN',b['turn'],'Courage',b['hp'],b['enemies'],flush=True)
        for action in range(18):
            if page.evaluate('MM.ctx.scenes.currentName')!='combat':return
            b=board(); enemies=[]; incoming=0; hits_now=[]
            if action>=3 and 'NO RUNNING' in b['visible']:break
            ghosts=next((int(re.search(r'Ghoststep (\d+)',x)[1]) for x in b['conditions'] if re.search(r'Ghoststep (\d+)',x)),0)
            for i,label in enumerate(b['enemies']):
                hp=re.search(r'(\d+) of \d+ Courage(?:, (\d+) Guard)?',label)
                if not hp or int(hp[1])<=0:continue
                hit=re.search(r'(\d+) damage(?:, (\d+) times)?',label)
                damage=int(hit[1])*(int(hit[2]) if hit[2] else 1) if hit else 0
                if hit:hits_now.extend([int(hit[1])]*(int(hit[2]) if hit[2] else 1))
                incoming+=damage
                enemies.append((int(hp[1])+int(hp[2] or 0),len(enemies),damage))
            if not enemies:break
            incoming=sum(hits_now[ghosts:])
            target=min(enemies)[1];durability=min(enemies)[0]
            candidates=[]
            for c in b['cards']:
                if not c['playable'] or c['key']>9:continue
                t=c['text'];cost=re.search(r', (\d+) Nerve',t);cost=max(1,int(cost[1]) if cost else 1)
                damage=re.search(r'Deal (\d+) damage',t);guard=re.search(r'Gain (\d+) Guard',t);haunt=re.search(r'Apply (\d+) Haunt',t)
                score=0; card_target=target
                if damage:
                    amount=int(damage[1])
                    if 'for each Life spent' in t:
                        lives=re.search(r'LIVES\s+(\d+)',b['visible'])
                        amount*=min(4,int(lives[1])) if lives else 0
                    hits=re.search(r'damage(?: to a random enemy)? (\d+) times',t)
                    if hits:amount*=int(hits[1])
                    if 'for each Nerve spent' in t:
                        amount*=b['energy'];cost=max(1,b['energy'])
                    if 'Repeat once for each Ghoststep' in t:amount*=1+min(ghosts,3)
                    if 'If you have Ghoststep, strike again' in t and ghosts:amount*=2
                    best=max(enemies,key=lambda e:min(amount,e[0])+(20+e[2] if amount>=e[0] else 0))
                    card_target=best[1]
                    score+=sum(min(amount,e[0]) for e in enemies) if 'to all enemies' in t else min(amount,best[0])
                    if amount>=best[0]:score+=20+best[2]
                if guard:score+=min(int(guard[1]),max(0,incoming-b['block']))*1.35
                if haunt:score+=int(haunt[1])*(2.4 if durability>18 else 1)
                if 'Power,' in t and 'Attacks deal' in t:score+=25 if sum(e[0] for e in enemies)>60 else 8
                if 'Gain 1 Nerve' in t:score+=30
                if c['name']=='Borrowed Life':score+=20
                if 'Ghoststep at the start of your next turn' in t:score+=5
                if 'If you have no Ghoststep, gain 1' in t and not ghosts and hits_now:score+=hits_now[0]*1.5
                if re.search(r'Gain \d+ Ghoststep\.',t) and ghosts<len(hits_now):score+=hits_now[ghosts]*1.5
                if score>0:candidates.append((score/cost,c['key'],c['name'],card_target))
            if not candidates:break
            _,key,name,target=max(candidates);print('PLAY',name,'at',target,flush=True)
            previous=[c['uid'] for c in b['cards']]
            play(key,target)
            if page.evaluate('MM.ctx.scenes.currentName')!='combat':
                snap('battle-finished');return
            after=board()
            if previous==[c['uid'] for c in after['cards']] and b['enemies']==after['enemies'] and b['energy']==after['energy'] and b['block']==after['block']:
                print('STOP: input did not consume the card');return
        if page.evaluate('MM.ctx.scenes.currentName')!='combat':return
        end()
    if page.evaluate('MM.ctx.scenes.currentName')=='combat':hand()
    else:snap('battle-finished')
