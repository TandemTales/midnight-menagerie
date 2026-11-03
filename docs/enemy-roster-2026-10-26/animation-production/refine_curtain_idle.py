from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production/build_crib_curtains_rig.py');s=p.read_text(encoding='utf-8-sig').replace("P/'batch-02'/'crib-curtains'","P/'batch-02'/'crib-curtains-v2'")
s=s.replace('sway=7*math.sin(2*math.pi*t);ripple=3*math.sin(2*math.pi*t);lift=1.8*math.sin(2*math.pi*t)', 'sway=7*math.sin(2*math.pi*t);ripple=3*math.sin(4*math.pi*t);lift=1.8*(1-math.cos(2*math.pi*t))')
p.write_text(s,encoding='utf-8')
