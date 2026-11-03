from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production/build_hall_mirror_preview.py')
s=p.read_text().replace('representative-v5','representative-v6');p.write_text(s,encoding='utf-8')
