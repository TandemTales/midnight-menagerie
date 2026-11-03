"""Prepare a minimal common lifecycle repair without changing comparison builds."""
from pathlib import Path
import difflib

source = Path('game/src/fx/combatfx.js').read_text(encoding='utf-8')
old = '''      this._retryWord=true;this._lastWordFit=false;
      this.number(entry.x,entry.y,entry.text,{...entry.o,...entry.o.refreshBounds?.()});
'''
new = '''      const fresh=entry.o.refreshBounds?.();
      // Despawned owners have no place for pending presentation. Retire the
      // entry once instead of repeatedly spawning an unowned label on retry.
      if(fresh&&!fresh.actor){
        this.wordQueue.splice(this.wordQueue.indexOf(entry),1);continue;
      }
      this._retryWord=true;this._lastWordFit=false;
      this.number(entry.x,entry.y,entry.text,{...entry.o,...fresh});
'''
assert source.count(old) == 1
fixed = source.replace(old, new)
Path('tmp/r50_combatfx-lifecycle.mjs').write_text(fixed, encoding='utf-8')
Path('tmp/r50_queue-lifecycle.patch').write_text(''.join(difflib.unified_diff(
    source.splitlines(keepends=True), fixed.splitlines(keepends=True),
    fromfile='a/game/src/fx/combatfx.js', tofile='b/game/src/fx/combatfx.js')), encoding='utf-8')
print('Prepared temporary module and minimal patch; no comparison build changed')
