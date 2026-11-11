"""Sequential repair / survey captures using survey 15's exact scene recipes.

python capture_help_frame.py WORKTREE PORT OUT [--screens comma,list] [--rooms]
Uses the prior UI loop's installed-Chrome capture wrapper.
Map-based captures additionally require the drawn flag, fonts and stable geometry.
Every attempt log and source PNG is retained under a unique run id.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

KID = ['--seed', '7', '--companion', 'bones', '--kid', 'maya']
DECK = "js:(s=>{s.setTier('medium',{persist:false});s.tierForced=true;s._scaleAdjust=1;s.resize()})(MM.ctx.stage)"
MAP_READY = r"""async () => {
  let timer;
  const settle = async () => {
    const tick = () => new Promise(resolve => requestAnimationFrame(resolve));
    let root;
    for (;;) {
      root = document.querySelector('.map-screen');
      if (window.MM?.ctx?.scenes?.currentName === 'map' && !MM.ctx.scenes.busy && root?.classList.contains('is-drawn')) break;
      await tick();
    }
    await document.fonts.ready;
    const hud = document.querySelector('.mm-hud');
    const bar = document.querySelector('.map-bar');
    const nodes = [MM.ctx.scenes.current.root, root, hud, bar].filter(Boolean);
    const snapshot = () => ({
      scroll: [scrollX, scrollY, document.scrollingElement.scrollLeft, document.scrollingElement.scrollTop, MM.ctx.dom.scrollLeft, MM.ctx.dom.scrollTop],
      rects: nodes.map(node => { const b=node.getBoundingClientRect(); return [b.left,b.top,b.right,b.bottom]; })
    });
    let previous = '', stable = 0, state;
    while (stable < 3) {
      await tick();
      const finite = nodes.flatMap(node => node.getAnimations({subtree:true})).some(animation =>
        animation.playState !== 'finished' && animation.playState !== 'idle' &&
        Number.isFinite(animation.effect?.getComputedTiming().endTime ?? Infinity));
      state = snapshot();
      const key = JSON.stringify(state);
      stable = !finite && key === previous ? stable + 1 : 0;
      previous = key;
    }
    if (state.scroll.some(value => value !== 0)) throw new Error('Map shell scrolled: '+JSON.stringify(state));
    console.info('[capture-ready] '+JSON.stringify({scene:'map',drawn:true,fonts:document.fonts.status,...state}));
  };
  try {
    await Promise.race([settle(),new Promise((resolve,reject) => {timer=setTimeout(() => reject(new Error('Map readiness timeout')),60000);})]);
  } finally {clearTimeout(timer);}
}"""
assert '|' not in MAP_READY  # shot.py uses this character as its step separator.

SCREENS = {}
for scene in ('shop', 'map'):
    SCREENS[scene] = ['--scene', scene, *KID, '--wait', '3']
for scene in ('reward', 'event', 'rest', 'gameover'):
    SCREENS[scene] = ['--scene', scene, *KID, '--wait', '3', '--hash', 'pics=1']
SCREENS.update({
    'opening': ['--scene', 'tutorial', '--seed', '7', '--kid', 'maya', '--wait', '4'],
    'settings': ['--scene', 'map', *KID, '--wait', '3', '--steps', 'click:.mm-hud__settings|wait:1'],
    'piles': ['--scene', 'combat', '--encounter', 'foyer-14', *KID, '--wait', '5', '--steps', 'click:#draw-pile|wait:1'],
    'lobby': ['--scene', 'lobby', *KID, '--wait', '3', '--steps', "js:(i=>{i.value='whispering-hideout';i.dispatchEvent(new Event('input',{bubbles:true}))})(document.querySelector('input[aria-label=Password]'))|wait:1"],
    'clubhouse': ['--scene', 'clubhouse', *KID, '--wait', '3'],
    'atlas': ['--scene', 'atlas', *KID, '--wait', '3'],
    'atlas-house': ['--scene', 'atlas', *KID, '--wait', '3', '--hash', 'all=1'],
    'hud-late': ['--scene', 'map', *KID, '--wait', '3', '--script', '@tools/shot-scripts/hud-late.js', '--steps', 'wait:1'],
    'combat-boss': ['--scene', 'combat', '--encounter', 'foyer-boss', *KID, '--wait', '8', '--steps', DECK+'|wait:3'],
    'combat-crowd': ['--scene', 'combat', '--encounter', 'foyer-boss', *KID, '--wait', '8', '--script', '@tools/shot-scripts/combat-crowd.js', '--steps', DECK+'|wait:3'],
})
# Extra focused views supplement the same map/combat votes in repair reviews.
# The full survey still captures exactly its original sixteen neutral screens.
SURVEY_SCREENS = tuple(SCREENS)
FOCUS_HELP = "js:(()=>{const b=[...document.querySelectorAll('.story-tools button')].find(b=>(b.getAttribute('aria-label')??b.textContent).trim()==='How to play');if(!b)throw new Error('Help button missing');b.focus()})()|wait:0.2"
for base in ('map', 'combat-boss'):
    recipe = list(SCREENS[base])
    if '--steps' in recipe:
        recipe[recipe.index('--steps')+1] += '|'+FOCUS_HELP
    else:
        recipe += ['--steps', FOCUS_HELP]
    SCREENS[base+'-focus'] = recipe

ROOMS = 'foyer:parlor,nursery:nursery,sleeping:dormitory,kitchens:kitchen,greenhouse:conservatory,graveyard:yard,study:library,attic:attic,lampworks:lampworks,ballroom:ballroom,crypt:catacomb,hedge:hedge,passages:passage,bathhouse:bathhouse,kennels:kennels,pumpkin:courtyard,heart:heart'

def publish_unique(source, target):
    """Publish an immutable, uniquely named capture without duplicate disk writes.

    Sources are retained. A hard link preserves exact bytes on the same volume;
    the copy fallback supports output folders on another filesystem. Never reuse
    these source names or overwrite an existing published artifact.
    """
    if target.exists():
        raise FileExistsError(f'Refusing to overwrite retained evidence: {target}')
    try:
        os.link(source, target)
    except OSError:
        shutil.copy2(source, target)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('worktree', type=Path)
    ap.add_argument('port')
    ap.add_argument('out', type=Path)
    ap.add_argument('--screens', default=','.join(SURVEY_SCREENS))
    ap.add_argument('--rooms', action='store_true')
    ap.add_argument('--browser-wrapper', type=Path, default=Path(__file__).with_name('chrome.py'))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    sources = (args.out/'sources').resolve()
    sources.mkdir(exist_ok=True)
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUNBUFFERED': '1', 'MM_CAPTURE_READY': '1'}
    failures = []
    run_id = time.strftime('%Y%m%d-%H%M%S')
    for width, height in ((1600, 900), (1280, 800)):
        for screen in args.screens.split(','):
            if not screen:
                continue
            name = screen + ('-1280' if width == 1280 else '')
            target = args.out / (name+'.png')
            if target.exists() and (args.out/(name+'.state.json')).exists():
                print('have', name, flush=True)
                continue
            for attempt in range(1, 4):
                shot = str(sources/(args.out.name+'-'+run_id+'-'+name+'-'+str(attempt)))
                recipe = list(SCREENS[screen])
                if screen in {'map', 'map-focus', 'hud-late', 'settings'}:
                    guard = 'jsawait:'+MAP_READY
                    if '--steps' in recipe:
                        step = recipe.index('--steps')+1
                        recipe[step] = guard+'|'+recipe[step]
                    else:
                        recipe += ['--steps', guard]
                cmd = [sys.executable, str(args.browser_wrapper), 'tools/shot.py', shot, '--port', args.port,
                       '--w', str(width), '--h', str(height), *recipe]
                attempt_log = args.out/(name+'.'+run_id+'.attempt-'+str(attempt)+'.log')
                with attempt_log.open('w', encoding='utf-8') as log:
                    try:
                        child = subprocess.Popen(cmd, cwd=args.worktree, env=env,
                                                 stdout=log, stderr=subprocess.STDOUT)
                        code = child.wait(timeout=600)
                    except subprocess.TimeoutExpired:
                        if child.poll() is None:
                            if os.name == 'nt':
                                subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],
                                               stdout=log, stderr=subprocess.STDOUT, check=False)
                            else:
                                child.kill()
                            child.wait()
                        code = 124
                shutil.copy2(attempt_log, args.out/(name+'.log'))
                state = Path(shot+'.state.json')
                source = Path(shot+'.png')
                try:
                    report = json.loads(state.read_text(encoding='utf-8'))
                    perf = report.get('perf', {})
                    valid = ('[still-ready]' in attempt_log.read_text(encoding='utf-8') and code in (0, 2) and not report.get('errors')
                             and not perf.get('warmTimeout') and 'voidStd' not in perf
                             and perf.get('gl') not in (None, '', 'none', '?', 'None'))
                    if screen in {'map', 'map-focus', 'hud-late', 'settings'}:
                        valid = valid and any('[capture-ready]' in line for line in report.get('logs', []))
                except (OSError, ValueError):
                    valid = False
                if valid and source.exists():
                    publish_unique(source, target)
                    publish_unique(state, args.out/(name+'.state.json'))
                    print('ok', name, 'exit', code, flush=True)
                    break
                print('retry', name, attempt, 'exit', code, flush=True)
            else:
                failures.append(name)
    if args.rooms:
        room_prefix = 'SURVEY-'+run_id+'-room-'
        cmd = [sys.executable, str(args.browser_wrapper), 'tools/room_batch.py', '--port', args.port, '--rooms', ROOMS,
               '--tier', 'medium', '--w', '1280', '--h', '800', '--prefix', str(sources/room_prefix),
               '--sheet', str(args.out/'rooms-sheet.png'), '--cols', '4']
        with (args.out/'rooms.log').open('w', encoding='utf-8') as log:
            result = subprocess.run(cmd, cwd=args.worktree, env=env, stdout=log,
                                    stderr=subprocess.STDOUT, timeout=1500)
        room_out = args.out/'rooms'
        room_out.mkdir(exist_ok=True)
        for source in sources.glob(room_prefix+'*.png'):
            name = 'SURVEY-room-'+source.name[len(room_prefix):]
            publish_unique(source, room_out/name)
        print('rooms exit', result.returncode, flush=True)
        if result.returncode:
            failures.append('rooms')
    print('CAPTURE FAILURES:', failures, flush=True)
    return bool(failures)

if __name__ == '__main__':
    sys.exit(main())
