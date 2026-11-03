from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production/validate_hall_mirror_rig.py')
s=p.read_text().replace("D=P/'representative-v5'","D=P/'representative-v6'")
p.write_text(s,encoding='utf-8')
