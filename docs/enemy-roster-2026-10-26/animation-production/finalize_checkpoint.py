from pathlib import Path
import json
p=Path('docs/enemy-roster-2026-10-26/animation-production')
f=p/'inspect_prototype.py';s=f.read_text(encoding='utf-8-sig').replace('round((b[1]+b[3])/2/256)','int((b[1]+b[3])/2/256)');f.write_text(s,encoding='utf-8')
v={'status':'not_verified','action':'Launch headless Playwright and inspect local animation-gallery.html playback, controls and screenshot','outcome':'Command produced no result or screenshot and was stopped with Ctrl-C; exit code 1. Browser stage is uncertain. No approval denial was reported.','browser_runtime_fps_verified':False,'gallery_controls_verified':False,'scope':'Local diagnostic preview only; no game or external website.'}
(p/'preview-browser-validation.json').write_text(json.dumps(v,indent=2),encoding='utf-8')
c=json.loads((p/'CHECKPOINT.json').read_text(encoding='utf-8'));c.update(actual_frames=40,diagnostic_preview='animation-gallery.html',diagnostic_atlas='hall-mirror-idle-diagnostic-atlas.png',requested_fps=30,diagnostic_duration_seconds=40/30,quality_status='pending_not_passed',quality_limitation='Fixed gold frame texture changes between adjacent generated poses; no accepted full-action representative enemy. Do not count as final animation.',matrix='enemy-action-matrix.json',pending_actions=663,blocked_actions=4,browser_validation='not_verified');(p/'CHECKPOINT.json').write_text(json.dumps(c,indent=2),encoding='utf-8')
print('Checkpoint updated; browser check explicitly unverified')
