from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production/validate_hall_mirror_rig.py');s=p.read_text(encoding='utf-8').replace("D=P/'representative-v3'","D=P/'representative-v5'")
s=s.replace("'visual_review':'Source,", "'visual_gate':'Technical checks only; full-speed intended-size visual review pending. Browser opening was denied by URL policy; no retry or bypass attempted.', 'visual_review':'Corrected positive character mattes and physical eyelid occlusion inspected in chronological contacts. Source,")
s=s.replace('local affine articulation and eyelid/effect compositing', 'local affine articulation, explicit premultiplied-alpha mattes and occluding eyelid/effect compositing')
p.write_text(s,encoding='utf-8')
