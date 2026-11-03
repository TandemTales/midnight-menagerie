from pathlib import Path

s = Path('tmp/r50_selected_capture.py').read_text(encoding='utf-8-sig')
s = s.replace('r50-20261029', 'r51-20261029').replace('GARNET', 'SPINEL').replace("'9502'", "'9512'")
s = s.replace("'round': 50", "'round': 51").replace('VALIDATED-CAPTURES-r50', 'VALIDATED-CAPTURES-r51')
s = s.replace('selected lifecycle repair retake', 'selected text-envelope repair retake')
guard = '''
battery = json.loads((root / 'winner-battery/results.json').read_text(encoding='utf-8'))
assert len(battery) == 7 and all(r['exit'] == 0 for r in battery)
def git(*args):
    return subprocess.check_output(['git', '-C', str(wt), *args]).decode().strip()
assert not git('diff', '--name-only') and not git('diff', '--cached', '--name-only')
comparison = '4a8ec4c28a38a55b3f90b4973d8c5a0b829b09b9'
changed_game = set(git('diff', '--name-only', comparison, 'HEAD', '--', 'game/src', 'game/assets').splitlines())
assert changed_game <= {'game/src/fx/combatfx.js', 'game/src/scenes/combat.css'}, changed_game
'''
s = s.replace("out = root / 'validated-SPINEL'", guard + "\nout = root / 'validated-SPINEL'")
Path('tmp/r51_selected_capture.py').write_text(s, encoding='utf-8')
