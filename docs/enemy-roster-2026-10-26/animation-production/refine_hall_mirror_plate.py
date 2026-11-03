from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production/build_hall_mirror_rig.py')
s=p.read_text(encoding='utf-8-sig').replace("parent/'representative-v2'","parent/'representative-v3'")
a=s.index('ghost=polygon(');b=s.index('\n# Sample genuinely empty',a)
s=s[:a]+'''# A broad glass strip removes the entire reflection, including its soft glow.
# The first prototype's silhouette-shaped feather retained a ghost outline.
sy_coord=(Y-TY)/S
rise=np.clip((sy_coord-365)/50,0,1);fall=np.clip((835-sy_coord)/55,0,1)
ghost=(rise*rise*(3-2*rise))*(fall*fall*(3-2*fall))*glass
'''+s[b:]
s=s.replace('spark=.35*(.5+.5*math.sin(2*math.pi*t))','spark=.35*(.5-.5*math.cos(2*math.pi*t))')
p.write_text(s,encoding='utf-8')
