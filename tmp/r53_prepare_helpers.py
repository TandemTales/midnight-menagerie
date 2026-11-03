from pathlib import Path
p=Path('tmp')
for name in ['capture_manifest','prepare_judges','record_selection','validate_selected','integrate']:
    s=(p/f'r52_{name}.py').read_text()
    s=s.replace('r52','r53').replace('Round52','Round53').replace("'round': 52","'round': 53").replace('round=52','round=53')
    if name=='capture_manifest':
        s=s.replace('r51-20261029','r52-20261029').replace('Round51','Round52')
    if name=='prepare_judges':
        s=s.replace("['ONYX', 'ALEXANDRITE', 'IOLITE', 'TOURMALINE']", "['SARDONYX', 'BERYL', 'CITRINE', 'FLUORITE']")
    (p/f'r53_{name}.py').write_text(s)
print('Prepared Round53 validation, review and guarded integration helpers')
