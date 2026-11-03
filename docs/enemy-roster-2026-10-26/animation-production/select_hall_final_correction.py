from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production/install_hall_mirror_correction.py')
s=p.read_text(encoding='utf-8-sig').replace('representative-v5','representative-v6').replace('hall-mirror-installed-v3','hall-mirror-installed-v5')
p.write_text(s,encoding='utf-8')
