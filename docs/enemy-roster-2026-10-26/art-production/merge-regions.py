import json,hashlib,importlib.util
from pathlib import Path
from PIL import Image
root=Path.cwd(); out=root/'docs/enemy-roster-2026-10-26/art-production'
spec=importlib.util.spec_from_file_location('prod',out/'root-production.py');prod=importlib.util.module_from_spec(spec);spec.loader.exec_module(prod)
m=json.loads((out/'coverage-manifest.json').read_text(encoding='utf-8')); by={e['production_id']:e for e in m['entries']}; added=[];issues=[]
for f in sorted(list(out.glob('region-*-results.json'))+list(out.glob('region-*-results-v*.json'))):
 try:r=json.loads(f.read_text(encoding='utf-8'))
 except json.JSONDecodeError:continue
 for e in r['entries']:
  if e['level']<5 or e['status']!='new':continue
  old=by[e['production_id']]
  try:
   for key in ['level','slot','name','description','signature','source_path','output_path']:assert old[key]==e[key],key+' mismatch'
   for key,vkey,fmt in [('source_path','source','PNG'),('output_path','technical','WEBP')]:
    p=root/e[key];meta=e['validation'][vkey]; im=Image.open(p);im.load();assert im.format==fmt and im.mode=='RGBA';assert list(im.size)==meta['size'];assert hashlib.sha256(p.read_bytes()).hexdigest()==meta['sha256'];assert im.getchannel('A').histogram()[0]>0
   side={'regular':256,'elite':512,'boss':1024}[e['tier']];assert e['validation']['source']['size']==[side,side]
   assert e['validation'].get('visual')
   if old['status']=='new':assert old['validation']['technical']['sha256']==e['validation']['technical']['sha256'];continue
   assert old['status']=='pending';old.update(e);added.append(e['production_id'])
  except Exception as x:issues.append({'id':e['production_id'],'issue':str(x) or type(x).__name__})
prod.write(m)
regions=[{'level':n,'covered':sum(e['status'] in ['new','existing'] for e in m['entries'] if e['level']==n),'total':11} for n in range(1,18)]
report={'counts':m['counts'],'newly_merged':added,'issues':issues,'regions':regions}
(out/'merge-validation-latest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
(out/'LATEST-CHECKPOINT.txt').write_text('ART PRODUCTION IN PROGRESS\n\n'+json.dumps(report,indent=2)+'\n\nExisting final sprites are immutable. Per-region results hold recoverable progress. Master counts include only saved and validated assets. Prompts and full-resolution originals are retained per asset. No game integration or animation work. Previous save outcome remains exactly: aborted by user; no inference is made whether technical or intentional. Any future explicit cancellation or denial must stop that action.\n',encoding='utf-8')
print(json.dumps({'counts':m['counts'],'merged':len(added),'issues':issues}))
