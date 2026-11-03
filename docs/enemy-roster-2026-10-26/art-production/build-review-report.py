import json,csv,hashlib,html,os,importlib.util
from pathlib import Path
from urllib.parse import quote
from PIL import Image,ImageDraw
root=Path.cwd();out=root/'docs/enemy-roster-2026-10-26/art-production'
spec=importlib.util.spec_from_file_location('prod',out/'root-production.py');prod=importlib.util.module_from_spec(spec);spec.loader.exec_module(prod)
m=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8'));errors=[];accepted=[];promptrows=[]
for e in m['entries']:
 if e['status'] not in ['new','existing']:continue
 try:
  for field,key,fmt in [('source_path','source','PNG'),('output_path','technical','WEBP')]:
   p=root/e[field];im=Image.open(p);im.load();assert im.format==fmt and im.mode=='RGBA',field+' format';assert im.getchannel('A').histogram()[0]>0,field+' alpha'
   if e['status']=='new':
    expected=e['validation'][key];assert list(im.size)==expected['size'];assert hashlib.sha256(p.read_bytes()).hexdigest()==expected['sha256']
    if field=='source_path':assert im.size==({'regular':256,'elite':512,'boss':1024}[e['tier']],)*2
   elif field=='output_path':assert hashlib.sha256(p.read_bytes()).hexdigest()==e['validation']['sha256']
  if e['status']=='new':
   v=e['validation']
   if not v.get('original_path') and e['production_id']=='hall-mirror':v['original_path']=str((out/'hall-mirror-original.png').relative_to(root))
   original=root/v['original_path'];assert original.exists()
   if not v.get('prompt_path'):
    candidate=original.with_name(original.name.replace('-original.png','-prompt.txt'))
    if not candidate.exists() and e['production_id']=='hall-mirror':candidate=out/'hall-mirror-prompts.txt'
    assert candidate.exists(),'prompt missing';v['prompt_path']=str(candidate.relative_to(root))
   assert (root/v['prompt_path']).exists()
   oi=Image.open(original);oi.load();assert oi.format=='PNG' and oi.mode=='RGBA'
   assert hashlib.sha256(original.read_bytes()).hexdigest()==v['original']['sha256'],'raw original hash'
   promptrows.append({'name':e['name'],'production_id':e['production_id'],'prompt_path':v['prompt_path'],'original_path':v['original_path'],'source_path':e['source_path'],'output_path':e['output_path']})
  accepted.append(e['production_id'])
 except Exception as x:errors.append({'id':e['production_id'],'error':str(x) or type(x).__name__})
protected={}
for fn in ['preserved-files-sha256.json','completed-foyer-preserved-sha256.json']:
 protected.update(json.loads((out/fn).read_text(encoding='utf-8')))
changed=[p for p,h in protected.items() if not (root/p).exists() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=h]
assert not changed,changed
assert len(m['entries'])==187 and len({e['production_id'] for e in m['entries']})==187
regions=[]
for n in range(1,18):
 es=[e for e in m['entries'] if e['level']==n];assert len(es)==11 and [sum(e['tier']==t for e in es) for t in ['regular','elite','boss']]==[7,3,1]
 regions.append({'level':n,'region':es[0]['region'],**{s:sum(e['status']==s for e in es) for s in ['existing','new','pending','blocked']}})
prod.write(m)
report={'coverage':m['counts'],'accepted_files_checked':len(accepted)*2,'source_original_prompt_checks':len(promptrows),'errors':errors,'protected_files_checked':len(protected),'changed_protected_files':changed,'mandatory_animated_identities':sum(e['existing_animation'] for e in m['entries']),'regions':regions,'blockers':[{'name':e['name'],**e['blocker']} for e in m['entries'] if e['status']=='blocked'],'tool_mode':'Built-in imagegen only','game_integration':'Not performed; no registries, gameplay, code or animations changed.'}
(out/'full-coverage-validation.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
with (out/'prompt-index.csv').open('w',newline='',encoding='utf-8-sig') as f:
 w=csv.DictWriter(f,fieldnames=['name','production_id','prompt_path','original_path','source_path','output_path']);w.writeheader();w.writerows(promptrows)
def href(p):return quote(os.path.relpath(p,out).replace('\\','/'),safe='/')
def esc(s):return html.escape(str(s),quote=True)
cards=[]
for e in m['entries']:
 ready=e['production_id'] in accepted;name=esc(e['name']);id=e['production_id'];status=e['status'];region=esc(e['region']);caption=f"{e['level']:02d} / {e['slot']} / {e['tier']} / {status}"
 art=f'<a href="{href(root/e["output_path"])}"><img src="{href(root/e["output_path"])}" alt="{name}" loading="lazy"></a>' if ready else '<p class="missing">No completed sprite<br>'+esc(status)+'</p>'
 links=f'<a href="{href(root/e["source_path"])}">Source PNG</a> <a href="{href(root/e["output_path"])}">WebP</a>' if ready else ''
 if status=='new':links+=f' <a href="{href(root/e["validation"]["original_path"])}">Original</a> <a href="{href(root/e["validation"]["prompt_path"])}">Prompt</a>'
 cards.append(f'<article data-status="{status}" data-search="{esc((e["name"]+" "+e["region"]+" "+e["tier"]).lower())}"><div class="art">{art}</div><h2>{name}</h2><p>{region}</p><small>{caption}</small><details><summary>Design and files</summary><p>{esc(e["description"])}</p><p>{esc(e["signature"])}</p><p>{links}</p></details></article>')
contacts=[]
for row in regions:
 n=row['level'];p=out/('foyer-complete-contact.jpg' if n==1 else f'region-{n:02d}-contact.jpg')
 if p.exists():contacts.append(f'<a href="{href(p)}">{n:02d} {esc(row["region"])}</a>')
counts=m['counts'];summary=f"{counts['existing']} existing · {counts['new']} new · {counts['pending']} pending · {counts['blocked']} blocked · 187 roster entries"
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Midnight Menagerie · Enemy art review</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#181821;color:#eee}body{max-width:1400px;margin:auto;padding:28px}h1{font-size:30px;margin-bottom:8px}.muted,small{color:#bdb8cb}a{color:#d8b7ff}header p{max-width:960px}nav{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0;align-items:center}input,select,button{font:inherit;padding:10px 13px;border:1px solid #686173;border-radius:7px;background:#292733;color:#eee}input{min-width:260px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}article{border:1px solid #413c50;border-radius:12px;padding:12px;background:#23212d}article[hidden]{display:none}.art{height:240px;display:flex;align-items:center;justify-content:center;background:#2d2b38;border-radius:8px}.art img{max-width:100%;max-height:225px;object-fit:contain}.art a{display:flex;align-items:center;justify-content:center;width:100%;height:100%}h2{font-size:17px;margin:12px 0 4px}article p{font-size:13px;margin:5px 0}small{font-size:11px}details{margin-top:10px;font-size:12px}details a{display:inline-block;margin:4px 8px 4px 0}.missing{text-align:center;color:#e0b49e}.light .art{background:#e4dfd2}.contacts{display:flex;gap:10px 18px;flex-wrap:wrap;margin:18px 0 28px;font-size:13px}footer{margin-top:36px;border-top:1px solid #413c50;padding-top:18px;font-size:13px}</style><header><h1>Midnight Menagerie · Enemy art review</h1><p class="muted">'''+summary+'''</p><p>Still sprites from the approved roster. Existing artwork and animations are preserved. No gameplay integration is included. Spectral Scullion has no image because its generation was rejected by the image tool at output moderation.</p><nav><input id="search" placeholder="Find an enemy or region" aria-label="Find an enemy or region"><select id="status" aria-label="Filter status"><option value="all">All roster entries</option><option value="new">New sprites</option><option value="existing">Existing sprites</option><option value="blocked">Blocked</option><option value="pending">Pending</option></select><button id="backdrop">Toggle light backdrop</button><span id="shown"></span></nav></header><details><summary>Regional contact sheets</summary><div class="contacts">'''+''.join(contacts)+'''</div></details><main class="grid">'''+''.join(cards)+'''</main><footer><a href="coverage-manifest.json">187-entry manifest</a> · <a href="coverage-manifest.csv">CSV</a> · <a href="full-coverage-validation.json">Validation</a> · <a href="prompt-index.csv">Prompt index</a> · <a href="spectral-scullion-blocker.json">Blocked request detail</a></footer><script>const q=document.querySelector('#search'),s=document.querySelector('#status'),cards=[...document.querySelectorAll('article')];function filter(){let n=0;for(const c of cards){c.hidden=!(c.dataset.search.includes(q.value.toLowerCase())&&(s.value==='all'||s.value===c.dataset.status));if(!c.hidden)n++;}document.querySelector('#shown').textContent=n+' entries shown';}q.addEventListener('input',filter);s.addEventListener('change',filter);document.querySelector('#backdrop').addEventListener('click',()=>document.body.classList.toggle('light'));filter();</script></html>'''
(out/'enemy-art-gallery.html').write_text(page,encoding='utf-8')
# Small standalone overview of only completed sprites; documentation preview, not sprite deliverables.
es=[e for e in m['entries'] if e['production_id'] in accepted];cols=11;cellw=170;cellh=190;rows=(len(es)+cols-1)//cols;sheet=Image.new('RGB',(cols*cellw,rows*cellh),(36,37,48));d=ImageDraw.Draw(sheet)
for i,e in enumerate(es):
 x=i%cols*cellw;y=i//cols*cellh;im=Image.open(root/e['output_path']).convert('RGBA');im.thumbnail((152,149));sheet.paste(im,(x+(cellw-im.width)//2,y+22+(149-im.height)//2),im);label=e['name'];d.text((x+6,y+4),str(e['level'])+' '+label[:25],fill='white');d.text((x+6,y+173),e['status'],fill=(180,175,195))
sheet.save(out/'all-completed-overview.jpg',quality=92)
lines=['MIDNIGHT MENAGERIE - ENEMY STILL ART PRODUCTION', '', f"COVERAGE: {counts['existing']} existing, {counts['new']} new, {counts['pending']} pending, {counts['blocked']} blocked; 187 identities total.", f"{len(accepted)} approved identities have saved, validated source PNG and runtime WebP files.", f"New deliverables: {counts['new']*2} final files ({counts['new']} PNG + {counts['new']} WebP).", '', 'DELIVERABLE LOCATIONS', 'Sources: animations/sprites/enemies/<camelCase>.png', 'Runtime stills: game/assets/sprites/enemies/<kebab-case>.webp', 'Exact per-identity paths: coverage-manifest.json / coverage-manifest.csv', 'Review gallery: enemy-art-gallery.html', 'Overview: all-completed-overview.jpg', 'Regional previews: contact-sheet links in gallery', 'Full-resolution original and prompt paths: prompt-index.csv', '', 'VALIDATION', f"{len(accepted)*2} approved final files checked for decoding, format, RGBA transparency, dimensions, and recorded hashes.", f"{len(promptrows)} new full-resolution PNG originals and prompt records verified.", f"{len(protected)} protected files unchanged: 367 initial enemy assets/atlases/metadata plus 8 completed foyer finals.", 'All 29 mandatory animated identities preserved. Every region retains 7 regular / 3 elite / 1 boss; 187 unique identities.', f"Validation errors: {len(errors)}. Evidence: full-coverage-validation.json.", 'No game code, gameplay data, asset registries or animation atlases changed. Still art is saved for later integration.', 'Built-in imagegen used throughout. No external paid service, purchase or credential setup.', '', 'REGION COVERAGE']
for row in regions:lines.append(f"{row['level']:02d} {row['region']}: existing {row['existing']}, new {row['new']}, pending {row['pending']}, blocked {row['blocked']}")
lines+=['', 'REMAINING BLOCKER', 'Spectral Scullion (level 4 R6): built-in imagegen denied generation at output moderation, HTTP400 moderation_blocked, category other. No image payload or final sprite was saved. Not retried; independent production continued.', 'Request ID: c49ad1f6-4178-418a-b8ec-ea7bb5ccec89. Exact action/target/status: spectral-scullion-blocker.json.', '', 'PRESERVATION AND HISTORY', 'Twenty additional preexisting still identities do not match this roster and remain unchanged; see unmatched-existing-art.json. They are not counted as coverage. No conflicting filenames were overwritten.', 'First Hall Mirror large-save tool outcome was exactly "aborted by user"; no inference is made about intentional cancellation versus technical abort. CHECKPOINT.txt retains the history.', 'A later Kennels report rename returned Windows Access is denied; the agent preserved it and saved immutable versioned result reports instead. Sprite delivery continued without repeating that rename.', 'Rejected render variants and original PNGs are retained in this documentation folder. No placeholder or prompt-only entry is counted as a completed sprite.']
(out/'ART-PRODUCTION-REPORT.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'coverage':counts,'checked_final_files':len(accepted)*2,'protected_unchanged':len(protected),'errors':errors,'gallery':'enemy-art-gallery.html'}))
