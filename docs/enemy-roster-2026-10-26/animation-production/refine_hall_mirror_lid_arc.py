from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production/build_hall_mirror_rig.py');s=p.read_text().replace("parent/'representative-v5'","parent/'representative-v6'")
s=s.replace('upper=-ry*(1-closure)+curve*closure\n   lower=ry*(1-closure)+curve*closure', 'dome=np.sqrt(np.clip(1-(u/(rx*.78))**2,0,1))\n   upper=-ry*.78*dome*(1-closure)+curve*closure\n   lower=ry*.78*dome*(1-closure)+curve*closure')
p.write_text(s,encoding='utf-8')
