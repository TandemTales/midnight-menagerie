"""Run unchanged SPINEL assertions with evidence redirected out of prior evidence."""
import sys
from pathlib import Path
name=sys.argv.pop(1)
source=Path('tests/ui-r51-spinel')/name
text=source.read_text(encoding='utf-8').replace('shots/ui-r51-spinel','docs/ui-pass/IOLITE-r55-proofs')
exec(compile(text,str(source),'exec'),{'__name__':'__main__','__file__':str(source.resolve())})
