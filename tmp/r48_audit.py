"""Run the repaired seam auditor against an isolated candidate, without editing it."""
import runpy
import sys
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
target = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
namespace = runpy.run_path(str(repo / 'tests/seams/check.py'))
globals_ = namespace['main'].__globals__
globals_['ROOT'] = str(target)
globals_['SRC'] = str(target / 'game/src')
sys.argv = ['check.py', '--json', str(output)]
namespace['main']()
