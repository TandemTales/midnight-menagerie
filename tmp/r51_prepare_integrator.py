from pathlib import Path

s = Path('tmp/r50_integrate.py').read_text()
s = s.replace('validated GARNET', 'the validated Round51 winner')
s = s.replace('import subprocess', 'import subprocess\nimport sys', 1)
s = s.replace('r50-20261029', 'r51-20261029')
s = s.replace("winner = root / 'b'", "winner = root / sys.argv[1]\ncode = sys.argv[2]\nslug = code.lower()")
s = s.replace('8dc9904a91448c8c41638f865aeade7fd0599ea2', 'c483cbb33fe2b458d0e0cd5e43443dfb6a198e29')
s = s.replace("'game/assets/ui/r50-garnet/'", "f'game/assets/ui/r51-{slug}/'")
s = s.replace("'docs/ui-pass/GARNET-r50-'", "f'docs/ui-pass/{code}-r51-'")
s = s.replace("'tools/prep_r50_garnet.py'", "f'tools/prep_r51_{slug}.py'")
s = s.replace("'tests/ui-r50-garnet/'", "f'tests/ui-r51-{slug}/'")
Path('tmp/r51_integrate.py').write_text(s)
