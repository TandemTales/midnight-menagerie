from pathlib import Path
import json,csv,zipfile,hashlib
ROOT=Path(__file__).resolve().parents[2]; OUT=Path(__file__).resolve().parent
entries=json.loads((OUT/'inventory.json').read_text(encoding='utf-8'))
evidence=json.loads((OUT/'active-image-evidence.json').read_text(encoding='utf-8'))
prior=json.loads((ROOT/'docs/enemy-roster-2026-10-26/art-production/preserved-files-sha256.json').read_text(encoding='utf-8'))
checks=[]
for e in evidence:
    key=e['path'].replace('/','\\')
    if key in prior: checks.append({'path':e['path'],'unchanged':prior[key]==e['sha256']})
(OUT/'original-preservation-check.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
with (OUT/'inventory.csv').open('w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f);w.writerow(['document_order','level','kind','enemy','status','eligible','batch','doc_start_index','source_sheet','still','runtime_index','visual_assessment'])
    for e in entries:
        a=e['evidence'];w.writerow([e['order'],e['region'],e['kind'],e['name'],e['status'],e['eligible'],e.get('batch',''),e['startIndex'],a.get('sourceSheet',''),a.get('still',''),a.get('runtimeIndex',''),a['visualAssessment']])
refs=['UI/selectCompanion.png','animations/sprites/enemies/animations/SS_coatrackCrawler_idle.png','animations/sprites/enemies/animations/SS_suitcase_idle.png','animations/sprites/enemies/animations/SS_blanketHydra_idle.png']
(OUT/'reference-manifest.json').write_text(json.dumps([{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()} for p in refs],indent=2),encoding='utf-8')
with zipfile.ZipFile(OUT/'MM-enemy-sprite-batches-levels-01-10.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in refs: z.write(ROOT/p,'references/'+p)
    for name in ['inventory.json','inventory.csv','ordered-roster.json','source-levels-01-10.json','progress-ledger.json','reference-manifest.json','README.txt']:
        z.write(OUT/name,name)
    for p in sorted((OUT/'batches').glob('*.txt')): z.write(p,'batches/'+p.name)
print(json.dumps({'preservation_checked':len(checks),'changed':[c for c in checks if not c['unchanged']],'bundle_bytes':(OUT/'MM-enemy-sprite-batches-levels-01-10.zip').stat().st_size}))
