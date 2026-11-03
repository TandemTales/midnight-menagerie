from pathlib import Path
import shutil

root = Path('D:/UILOOP/r50-20261029')
selected = root / 'b'
target = selected / 'game/src/fx/combatfx.js'
assert target.read_text(encoding='utf-8') == Path('game/src/fx/combatfx.js').read_text(encoding='utf-8')
prototype = Path('tmp/r50_combatfx-lifecycle.mjs').read_text(encoding='utf-8')
assert 'if(fresh&&!fresh.actor)' in prototype
target.write_text(prototype, encoding='utf-8', newline='\n')
tests = selected / 'tests/ui-r50'
tests.mkdir(exist_ok=True)
shutil.copy2('tmp/r50_queue_lifecycle.mjs', tests / 'queue-lifecycle.mjs')
shutil.copy2('tmp/r50_queue_lifecycle_browser.py', tests / 'queue-lifecycle.py')
for source, name in [
    (root / 'lifecycle-before/proof.json', 'GARNET-r50-lifecycle-before.json'),
    (root / 'lifecycle-prototype/proof.json', 'GARNET-r50-lifecycle-prototype.json'),
    (Path('tmp/r50-queue-lifecycle-proof.json'), 'GARNET-r50-lifecycle-unit.json'),
]:
    shutil.copy2(source, selected / 'docs/ui-pass' / name)
print('Applied lifecycle repair and preserved regression tests/evidence in selected b only')
