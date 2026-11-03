"""Read-only audit of inherited functional checks and candidate wrapper changes."""
import ast
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('D:/UILOOP/r56-20261029')
manifest = json.loads((root / 'manifest.json').read_text())
names = ['probe-queue.py', 'probe-idle-resize.py', 'queue-lifecycle.py',
         'memorial.py', 'keepsakes.py', 'interactions.py', 'event-boundary.py']
rows = []
for slot, code in manifest['builders'].items():
    wt = root / slot
    folder = f'tests/ui-r56-{code.lower()}'
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
                    assert key in ['R56_OUT', 'R56_BOARD_OUT'] and default == f'docs/ui-pass/{code}-r56-proofs'
                    output_environment_variables.append(key)
                    values.append(default)
                else:
                    values.append(ast.literal_eval(a))
            assert len(values) == 2 and (values == ['shots/ui-r51-spinel', f'docs/ui-pass/{code}-r56-proofs'] or
                values == ['lavender-paint-v1.webp', {'TOPAZ':'lavender-paint-v1.webp','ONYX':'lavender-paint-v1.webp','AMBER':'r56-amber/lavender-face.webp'}[code]]), values
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
    variant=None
    owned=wt/folder/'memorial.py'
    if owned.exists():
        baseline_tree=ast.parse((wt/'tests/ui-r51-spinel/memorial.py').read_text(encoding='utf-8'))
        owned_text=owned.read_text(encoding='utf-8')
        class NormalizeBoundedWait(ast.NodeTransformer):
            count=0
            def visit_Try(self,node):
                if len(node.body)==1 and isinstance(node.body[0],ast.Expr):
                    call=node.body[0].value
                    if isinstance(call,ast.Call) and ast.unparse(call.func)=='page.wait_for_function':
                        assert len(call.args)==1 and ast.literal_eval(call.args[0])=="label=>document.querySelector('.r49-scrollcue[data-board-scroll='+label+']')?.dataset.end==='true'"
                        assert {x.arg:ast.unparse(x.value) for x in call.keywords}=={'arg':'label','timeout':'5000'}
                        assert not node.orelse and not node.finalbody and len(node.handlers)==1
                        handler=node.handlers[0]
                        assert ast.unparse(handler.type)=='Exception' and len(handler.body)==2 and isinstance(handler.body[-1],ast.Raise)
                        assert 'end-state-failure.json' in ast.unparse(handler.body[0])
                        self.count+=1
                        return ast.parse('page.wait_for_timeout(150)').body[0]
                return self.generic_visit(node)
        transform=NormalizeBoundedWait(); normalized=transform.visit(ast.parse(owned_text))
        assert transform.count==1 and ast.dump(normalized)==ast.dump(baseline_tree),(code,'Unreviewed memorial fixture changes')
        variant={'path':str(owned.relative_to(wt)),'sha256':hashlib.sha256(owned.read_bytes()).hexdigest(),
                 'only_change':'Fixed150ms settling delay replaced by bounded5s wait for the same data-end predicate, with failure diagnostics; original assertion and all other AST nodes retained.',
                 'original_failure_retained':(wt/f'docs/ui-pass/{code}-r56-proofs/failed-memorial-fixed150ms').exists(),
                 'common_sync_protocol':'tmp/r56_memorial_wait_protocol.md'}
    rows.append({'code':code,'wrapper_sha256':hashlib.sha256(wrapper.encode()).hexdigest(),
                 'wrapper_replacements':replacements, 'permitted_output_directory_environment_variables':output_environment_variables,
                 'inherited_checks':checks,'reviewed_owned_memorial_variant':variant})
output = {'method':'Inherited sources equal snapshot; wrappers change evidence paths/paint expectation only. Any owned memorial variant is AST-identical after restoring one reviewed bounded same-predicate wait to its original150ms delay; original assertion remains.',
          'base':manifest['base'],'rows':rows}
Path('docs/ui-pass/ASSERTION-AUDIT-r56.json').write_text(json.dumps(output, indent=2), encoding='utf-8')
print('Preserved inherited checks verified for all three candidates')
