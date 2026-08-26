"""Gate: every hook a card LISTENS on must be a hook something DISPATCHES.

    python tests/hook-names/check.py

WHY THIS EXISTS
---------------
A hook registered under a name nothing ever fires is completely silent. The card
plays, the animation runs, the events come out, the tests go green, and the
effect never happens. It is the same failure shape as CONTRACTS rule 8 — the one
that let Marmalade's Haunt deal zero damage for an entire build — except the
misspelling is a hook name rather than a `?.`.

Three co-op cards were written against names that do not exist and all three
were caught by this gate rather than by play:

  * `pipkin/community-garden` registered `engine.hooks.add('harvested', ...)`.
    Companion Powers fire through `U.fire(c, 'harvest')`, so the Guard payout
    never ran.
  * `wink/silk-lifeline` and `wink/everyone-duck` registered `beforeDamaged`,
    which nothing dispatches. The real hook is `onIncomingHit`.

TWO REGISTRIES
--------------
  engine hooks  `engine.hooks.add(name, ...)` — must match a name the engine
                dispatches via hooks.dispatch / hooks.reduce / hooks.any.
  companion hooks
                `U.onHook(name, statusId, fn)` — must match a name some
                companion fires via `U.fire(c, name, ...)`.

Exit code 1 if any listener names a hook nothing fires.
"""
import os, re, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "game", "src")

DISPATCH = re.compile(r"hooks\.(?:dispatch|reduce|any)\(\s*['\"]([A-Za-z][\w:]*)['\"]")
ADD = re.compile(r"hooks\.add\(\s*['\"]([A-Za-z][\w:]*)['\"]")
# `fire(c, name)` and `fireCompanionHook(c, name)` are BOTH real dispatch sites.
# Matching only the first made a live Marmalade Power (always-lands, listening on
# ghoststepConsumed) look unreachable — a false alarm from a gate is as costly as
# a miss, because the next person learns to ignore it.
FIRE = re.compile(r"\bfire(?:CompanionHook)?\(\s*\w+\s*,\s*['\"]([A-Za-z][\w:]*)['\"]")
COMMENT = re.compile(r"^\s*(//|\*|/\*)")
ONHOOK = re.compile(r"\bonHook\(\s*['\"]([A-Za-z][\w:]*)['\"]")
# Statuses declare their hooks as object keys under `hooks: { name: ... }`.
HOOKS_BLOCK = re.compile(r"hooks:\s*\{", re.M)
HOOK_KEY = re.compile(r"^\s*([A-Za-z]\w*)\s*:\s*(?:D\()?", re.M)


def js_files():
    for base, _dirs, files in os.walk(SRC):
        for fn in files:
            if fn.endswith(".js"):
                yield os.path.join(base, fn)


def main():
    dispatched, fired = set(), set()
    listeners, companion_listeners = [], []
    files = list(js_files())

    for path in files:
        with open(path, encoding="utf-8") as f:
            text = f.read()
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        dispatched.update(DISPATCH.findall(text))
        fired.update(FIRE.findall(text))
        for lineno, line in enumerate(text.split("\n"), 1):
            # A comment describing this trap is not an instance of it.
            if COMMENT.match(line):
                continue
            for name in ADD.findall(line):
                listeners.append((rel, lineno, name, line.strip()))
            for name in ONHOOK.findall(line):
                companion_listeners.append((rel, lineno, name, line.strip()))

    problems = []
    for rel, ln, name, line in listeners:
        if name not in dispatched:
            problems.append((rel, ln, name, line, "engine", sorted(dispatched)))
    for rel, ln, name, line in companion_listeners:
        if name not in fired:
            problems.append((rel, ln, name, line, "companion", sorted(fired)))

    for rel, ln, name, line, kind, known in problems:
        print(f"  {rel}:{ln}")
        print(f"      {line[:110]}")
        near = [k for k in known if k.lower().startswith(name.lower()[:4])] or known[:6]
        print(f"      -> nothing dispatches the {kind} hook \"{name}\". Did you mean: {', '.join(near[:6])}")

    print(f"RESULT: {len(files)} files, {len(dispatched)} engine hooks, {len(fired)} companion hooks, "
          f"{len(listeners) + len(companion_listeners)} listeners, {len(problems)} unknown")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
