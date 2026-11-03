from pathlib import Path
p = Path('tmp')
s = (p / 'r51_setup.py').read_text()
s = s.replace('Round51', 'Round52').replace('r51-', 'r52-').replace('r50-', 'r51-')
s = s.replace('GARNET', 'SPINEL').replace('OBSIDIAN', 'ONYX').replace('MOONSTONE', 'ALEXANDRITE').replace("'b': 'SPINEL'", "'b': 'IOLITE'").replace('ZIRCON', 'TOURMALINE')
s = s.replace('9510', '9520').replace('9511', '9521').replace('9512', '9522').replace('9513', '9523')
s = s.replace('[48, 49, 50, 51]', '[48, 49, 50, 51, 52]')
s = s.replace("earlier = json.loads(Path('D:/UILOOP/r49-20261029/integration.json').read_text())\napplied.update(row['path'] for row in earlier['files'])", "for older in [49, 50]:\n    earlier = json.loads(Path(f'D:/UILOOP/r{older}-20261029/integration.json').read_text())\n    applied.update(row['path'] for row in earlier['files'])")
s = s.replace('lifecycle-repair combat retakes. Main integration byte-verified all32 files.', 'text-envelope repair combat retakes. Main integration files were byte-verified.')
(p / 'r52_setup.py').write_text(s)
for name in ['capture_manifest', 'prepare_judges']:
    s = (p / f'r51_{name}.py').read_text().replace('r51', 'r52').replace('r50', 'r51').replace('Round50', 'Round51').replace("'round': 51", "'round': 52")
    s = s.replace('OBSIDIAN', 'ONYX').replace('MOONSTONE', 'ALEXANDRITE').replace('SPINEL', 'IOLITE').replace('ZIRCON', 'TOURMALINE')
    (p / f'r52_{name}.py').write_text(s)
print('Prepared Round52 setup and image/review helpers; no worktrees created yet')

for name in ['validate_selected', 'integrate']:
    s = (p / f'r51_{name}.py').read_text().replace('Round51', 'Round52').replace('r51', 'r52').replace("'round': 51", "'round': 52")
    s = s.replace("base = 'c483cbb33fe2b458d0e0cd5e43443dfb6a198e29'", "base = json.loads((root / 'manifest.json').read_text())['base']")
    s = s.replace("'tests/ui-r50/')", "'tests/ui-r50/', 'tests/ui-r51-spinel/')")
    (p / f'r52_{name}.py').write_text(s)
