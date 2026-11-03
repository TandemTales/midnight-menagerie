"""Read-only audit of inherited functional checks and candidate wrapper changes."""
import ast
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('D:/UILOOP/r55-20261029')
manifest = json.loads((root / 'manifest.json').read_text())
names = ['probe-queue.py', 'probe-idle-resize.py', 'queue-lifecycle.py',
         'memorial.py', 'keepsakes.py', 'interactions.py', 'event-boundary.py']
rows = []
for slot, code in manifest['builders'].items():
    wt = root / slot
    folder = f'tests/ui-r55-{code.lower()}'
    wrapper = (wt / folder / 'inherited.py').read_text(encoding='utf-8')
    replacements = []
    output_environment_variables = []
    for n in ast.walk(ast.parse(wrapper)):
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'replace':
            values = []
            for a in n.args:
                if isinstance(a, ast.Call):
                    assert ast.unparse(a.func) == 'os.environ.get' and len(a.args) == 2 and not a.keywords
                    key, default = [ast.literal_eval(v) for v in a.args]
                    assert key in ['R55_OUT', 'R55_BOARD_OUT'] and default == f'docs/ui-pass/{code}-r55-proofs'
                    output_environment_variables.append(key)
                    values.append(default)
                else:
                    values.append(ast.literal_eval(a))
            assert len(values) == 2 and (values == ['shots/ui-r51-spinel', f'docs/ui-pass/{code}-r55-proofs'] or
                values == ['lavender-paint-v1.webp', {'JADE':'lavender-paint-v1.webp','IOLITE':'lavender-paint-v1.webp','ZIRCON':'lavender-paint-v1.webp'}[code]]), values
            replacements.append(values)
    checks = []
    for name in names:
        rel = 'tests/ui-r51-spinel/' + name
        baseline = subprocess.check_output(['git', '-C', str(wt), 'show', manifest['base'] + ':' + rel]).decode('utf-8')
        current = (wt / rel).read_text(encoding='utf-8')
        assert baseline.replace('\r\n', '\n') == current.replace('\r\n', '\n'), (code, rel, 'Inherited check changed; inspect before accepting')
        checks.append({'path':rel, 'sha256':hashlib.sha256((wt / rel).read_bytes()).hexdigest(),
                       'unchanged_from_snapshot':True,
                       'python_assertions':sum(isinstance(n, ast.Assert) for n in ast.walk(ast.parse(current)))})
    rows.append({'code':code,'wrapper_sha256':hashlib.sha256(wrapper.encode()).hexdigest(),
                 'wrapper_replacements':replacements, 'permitted_output_directory_environment_variables':output_environment_variables,
                 'inherited_checks':checks})
output = {'method':'Inherited test sources equal supplied snapshot; wrapper changes limited to evidence directory (including named directory overrides) and heading image name.',
          'base':manifest['base'],'rows':rows}
Path('docs/ui-pass/ASSERTION-AUDIT-r55.json').write_text(json.dumps(output, indent=2), encoding='utf-8')
print('Preserved inherited checks verified for all three candidates')
