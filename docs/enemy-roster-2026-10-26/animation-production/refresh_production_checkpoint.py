"""Current matrix/receipt-derived checkpoint; no gameplay changes."""
from pathlib import Path
import json,hashlib,datetime
from collections import Counter
P=Path(__file__).resolve().parent;ROOT=P.parents[2]
now=datetime.datetime.now(datetime.timezone.utc).isoformat();matrix=json.loads((P/'enemy-action-matrix.json').read_text());summary=matrix['summary'];registry=json.loads((P/'animation-deliveries.json').read_text());orientation=json.loads((P/'orientation-audit/orientation-decisions.json').read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
audited=[];deliveries={}
for eid,entry in registry.items():
 receipt=json.loads((P/entry['receipt']).read_text());assert receipt['complete']
 for f in receipt['files']:
  assert digest(ROOT/f['path'])==f['sha256'],f['path'];audited.append(f)
 m=json.loads((ROOT/'game/assets/sprites/enemy-clips'/eid/'index.json').read_text())
 deliveries[eid]={**entry,'orientation':orientation[eid],'clips':{s:{k:c[k] for k in ['frames','fps','loop','hold','fw','fh','anchor','unit']} for s,c in m['clips'].items()}}
legacy=[]
for path in (P/'orientation-audit/legacy-derivatives').glob('*/saved-assets.json'):
 r=json.loads(path.read_text());assert r['complete']
 for f in r['files']:assert digest(ROOT/f['path'])==f['sha256'],f['path']
 for f in r['original_inputs']:assert digest(ROOT/f['path'])==f['sha256'],f['path']
 legacy.append({'enemy':r['enemy'],'actions':len(r['checks']),'receipt':path.relative_to(P).as_posix(),'status':r['status'],'files_checked':len(r['files'])})
reels=[];historical=[]
for path in (P/'review-reels').glob('*.json'):
 r=json.loads(path.read_text());assert digest(ROOT/r['path'])==r['sha256']
 current=all(digest(ROOT/i['path'])==i['sha256'] for i in r['inputs'])
 item={k:r[k] for k in ['path','sha256','fps','decoded_frames','duration_seconds','bytes']};item['validation']=path.relative_to(P).as_posix()
 (reels if current else historical).append(item)
pres=json.loads((P/'preservation-validation.json').read_text());assert pres['passed'];pres['checked_utc']=datetime.datetime.fromtimestamp((P/'preservation-validation.json').stat().st_mtime,datetime.timezone.utc).isoformat()
limits={'method':'Enemy-specific 2D source-art articulation, not fully redrawn animation or AI video. Each creature/body/prop needs its own appropriate rig and quality review.','visual':'All new clips remain provisional. Chronological key poses and authored direction curves inspected; all frame timing/order/alpha/bounds/loop/endpoint checks passed. Full-speed intended-size visual approval is pending.','browser':'Browser file URL opening was denied by policy; no browser navigation, alternate route or workaround used. MP4s were rendered and fully decoded locally as authorized review deliverables.','integration':'No game registry, gameplay, balance, publication or deployment edits. Oven Maw alternate is not selected by the live loader.'}
checkpoint={'updated_utc':now,'status':'saved_provisional_batch_left_staged_production_unfinished',**summary,'fps':30,'deliveries':deliveries,'legacy_derivatives':legacy,'current_review_reels':reels,'historical_superseded_reels':historical,'preservation':pres,'new_asset_hashes_checked':len(audited),'limits':limits,'blocked':[{'target':'Spectral Scullion / idle, attack, hurt, defeat','status':'denied_dependency','reason':'Base still unavailable after prior generation output moderation denial. No retry or bypass.'},{'target':'Browser full-speed playback check','status':'denied_route','reason':'Prior URL policy denial. Offline MP4 delivery completed; full-speed temporal visual review still pending.'}],'pending_work':f"{summary['pending_actions']} usable new actions unproduced; saved actions await final temporal review; legacy pose corrections/integration remain as recorded in orientation-audit/orientation-decisions.json."}
library=json.loads((P/'library-delivery-status.json').read_text()) if (P/'library-delivery-status.json').exists() else None
if library:
 checkpoint['library_delivery']=library
 if library['status']=='saved_library_local_metadata_unsupported':
  checkpoint['blocked'].append({'target':'Native local Library metadata on original MP4 files','status':'unsupported_platform','reason':'Both Library files created successfully through documented fallback. Required metadata helper attempted; os.setxattr unavailable on Windows. Identity retained in project receipt; no duplicate upload.'})
 else:
  checkpoint['blocked'].append({'target':'Native Library attachments','status':library['status'],'reason':library['local_metadata']})
(P/'CHECKPOINT.json').write_text(json.dumps(checkpoint,indent=2),encoding='utf-8')
(P/'delivery-hash-validation.json').write_text(json.dumps({'checked_utc':now,'checked':len(audited),'passed':True,'files':audited,'legacy_derivative_files_checked':sum(r['files_checked'] for r in legacy)},indent=2),encoding='utf-8')
lines=['MIDNIGHT MENAGERIE - CURRENT ANIMATION PRODUCTION CHECKPOINT',now,'',f"SAVED PROVISIONAL: {summary['new_saved_enemies']} new enemies / {summary['new_saved_actions']} actions. FINAL APPROVED: {summary['new_final_actions']}.",f"UNPRODUCED: {summary['pending_actions']} usable new actions. BLOCKED DEPENDENCY: 4 Spectral Scullion actions.",'663 usable new actions = saved provisional actions + still-unproduced actions. The four blocked actions are separate.','Existing 29 animated enemies / 118 actions retained unchanged. Legacy alternates are not counted as new-enemy completion.','','CURRENT LOCAL MP4 REVIEW REELS']
for r in reels:lines.append(f"{r['path']} — {r['decoded_frames']} decoded frames / {r['fps']} fps / {r['duration_seconds']} s. Verification: {r['validation']}")
lines+=['Each reel uses 200/unit and recorded pivots; actual game stage scale varies. Idle repeats twice, each one-shot plays once, and defeat holds for one review second.','The earlier first-three-enemies-30fps.mp4 is retained as historical pre-orientation output and is superseded.','','SAVED NEW ENEMIES']
for eid,d in deliveries.items():
 lines += [eid+' — provisional; '+d['orientation']['status'],'Receipt: '+d['receipt'],'Validation: '+d['validation'],d['orientation']['evidence']]
 for state,c in d['clips'].items():lines.append(f"  {state}: {c['frames']} frames, {c['fps']} fps, {c['frames']/c['fps']:g}s, loop={c['loop']}, hold={c['hold']}, cell={c['fw']}x{c['fh']}, anchor={c['anchor']}, unit={c['unit']}")
lines+=['','ASSET PATHS','Source sheets: animations/sprites/enemies/animations/SS_<source-key>_<state>.png','Runtime atlases/index: game/assets/sprites/enemy-clips/<id>/','Exact paths, hashes and sizes are in each receipt and delivery-hash-validation.json.','Superseded new assets are retained byte-for-byte under revisions/. All original inputs remain intact.','','ORIENTATION AUDIT','All 29 legacy enemies were inspected through eight selected decoded runtime poses each; this is not every-frame/full-speed approval.','Slipper Skitter and Blanket Hydra are already mirrored by the renderer. Do not double-flip.','Five legacy identities (21 actions) show left staging in sampled poses. Of the other 24, Oven Maw now has four compatible left-facing alternates; 23 identities (93 actions) still need pose correction/directional derivatives.','Oven Maw alternate: game/assets/sprites/enemy-clips-left/oven-maw/index.json. Original frame counts, FPS, loop, hold, ping and fade semantics preserved; pivot reflected about the feet. Original files unchanged.','The alternate directory is not used by the current loader. A separately authorized asset-path integration is needed; no gameplay/registry edit was made.','Governess has mixed direction across attack/cast, so a blanket flip would not solve it. Text/tag marks and held props also require selective handling for other legacy enemies.','Full decisions: orientation-audit/orientation-decisions.json. Contacts: orientation-audit/legacy-runtime-1.jpg through -6.jpg.','','VALIDATION AND LIMITS',*limits.values(),'','PRESERVATION',f"{pres['checked']} original files rehashed unchanged; zero changed or missing; checked {pres['checked_utc']}.",f"{len(audited)} current new-asset hashes and {sum(r['files_checked'] for r in legacy)} legacy-alternate file hashes checked against receipts.",'No purchases, external publishing, credentials, accounts, or sharing-permission changes. Requested Library preview delivery only.','','BLOCKERS','Spectral Scullion base-image dependency: prior moderation denial; no retry. Four actions remain blocked.','Browser playback: prior URL-policy denial respected. Offline MP4s complete; final temporal visual review pending.','','RESUME',checkpoint['pending_work'],'Use enemy-action-matrix.json/.csv and animation-deliveries.json as coverage authorities.','After each batch: validate individual source/runtime/preview sequences, record orientation evidence, preserve superseded new assets, save with receipt guards, rebuild matrix, rerun check_preservation.py, and run this report generator.','Do not run the standard prep_sprites.py batch CLI; it changes FPS/frame counts and modifies/deletes registry-linked output.']
if library:
 lines+=['','LIBRARY DELIVERY',library['status'],library['local_metadata'],library['retry']]
 for f in library['files']:lines.append(f"{f['path']} - {f['bytes']} bytes - Library ID: {f.get('library_file_id','none')}")
(P/'ANIMATION-PRODUCTION-REPORT.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
olines=['SCREEN-LEFT ORIENTATION AUDIT — CURRENT',now,'','All 29 legacy identities inspected in sampled runtime poses; no original was overwritten.','Runtime reflection already applies to Slipper Skitter and Blanket Hydra.','Five legacy identities / 21 actions are left in sampled poses; 23 / 93 require directional pose corrections.','Oven Maw / 4 actions has a saved alternate that is not integrated.',f"All {len(deliveries)} new rigs have left-staged decoded key poses; full-speed visual approval remains pending.",'']
for eid,o in orientation.items():olines += [eid+' — '+o['status'],o['evidence'],'']
olines += [limits['browser'],limits['integration']]
(P/'orientation-audit/ORIENTATION-REPORT.txt').write_text('\n'.join(olines)+'\n',encoding='utf-8')
print(json.dumps({'saved_actions':summary['new_saved_actions'],'pending_actions':summary['pending_actions'],'final_approved':summary['new_final_actions'],'preserved':pres['checked'],'new_assets_checked':len(audited),'legacy_alternate_files':sum(r['files_checked'] for r in legacy),'current_reels':len(reels)}),flush=True)
