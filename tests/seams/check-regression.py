"""Controls for the static option audit, including long stripped literals."""
import runpy
import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

CHECK = Path(__file__).with_name('check.py')
Checker = runpy.run_path(str(CHECK))['Checker']


def audit(source):
    checker = Checker(SimpleNamespace(option_keys={'addCard': {'quiet'}}))
    checker.check_option_keys(str(CHECK), source)
    return checker.problems


class OptionAuditControls(unittest.TestCase):
    def test_unknown_option_is_reported(self):
        problems = audit('ctx.addCard(card, { typo: true });')
        self.assertEqual([p['kind'] for p in problems], ['UNKNOWN-OPTION'])
        self.assertIn('typo', problems[0]['msg'])

    def test_known_option_is_accepted(self):
        self.assertEqual(audit('ctx.addCard(card, { quiet: true });'), [])

    def test_local_multiline_method_keeps_its_own_contract(self):
        source = '\n\n\taddCard(\n card, opts = {}\n) { }\nthis.addCard(card, { local: true });'
        self.assertEqual(audit(source), [])

    def test_long_blanked_literal_does_not_stall(self):
        subprocess.run([sys.executable, str(Path(__file__).resolve()), '--blank-control'],
                       check=True, timeout=5, capture_output=True)


if __name__ == '__main__':
    if '--blank-control' in sys.argv:
        assert audit((' ' * 40 + '\n') * 50000 + '\nconst untouched = 1;') == []
    else:
        unittest.main()
