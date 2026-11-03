from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production/validate_hall_mirror_rig.py')
s=p.read_text(encoding='utf-8-sig').replace("frames.append(a.copy())", "canonical=a.copy();canonical[canonical[:,:,3]==0]=0\n  frames.append(canonical)")
s=s.replace("'method_limit':'Layered source-art", "'invisible_rgb':'RGB under alpha=0 is ignored for endpoint and uniqueness checks; lossless WebP may discard it. All visible pixels and alpha are compared exactly.', 'method_limit':'Layered source-art")
p.write_text(s,encoding='utf-8')
