"""Prepare neutral image-only review inputs; does not start a review."""
from pathlib import Path
import json

repo = Path.cwd()
out = repo / 'docs/ui-pass/judges-r51'
out.mkdir(exist_ok=True)
root = Path('D:/UILOOP/r51-20261029/judging')
codes = ['OBSIDIAN', 'MOONSTONE', 'SPINEL', 'ZIRCON']
screens = [s + suffix for s in ['rest', 'event', 'gameover', 'shop', 'combat-floaters']
           for suffix in ['', '-1280']]
for number, order in [(1, codes), (2, codes[::-1])]:
    data = {
        'judge': number,
        'rubrics': [str(repo / 'docs/ui-pass' / name) for name in ['RUBRIC.md', 'RUBRIC-r51.md']],
        'references': [str(repo / 'UI' / name) for name in ['title.png', 'mainMenu.png', 'selectCompanion.png', 'selectKid.png']],
        'order': order,
        'candidates': {code: [str(root / code / (screen + '.png')) for screen in screens] for code in order},
        'output': str(out / f'judge{number}-final.json'),
    }
    (out / f'judge{number}-input.json').write_text(json.dumps(data, indent=2))
print('Prepared two opposite-order image-only review inputs; no reviews dispatched')
