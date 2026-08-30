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

THREE REGISTRIES
----------------
  engine hooks  `engine.hooks.add(name, ...)` — must match a name the engine
                dispatches via hooks.dispatch / hooks.reduce / hooks.any /
                hooks.veto.
  companion hooks
                `U.onHook(name, statusId, fn)` — must match a name some
                companion fires via `U.fire(c, name, ...)`.
  declared hooks
                `hooks: { name(h) {…} }` on a status, relic or enemy def, and
                `handHooks: { … }` on a card. This is the BIGGEST registry by
                far — 76 keys against 92 call-site listeners — and it was going
                completely unchecked: the two regexes for it were written,
                left unused at the top of this file, and the gate reported
                green over them. A misspelling here is the same silence as
                anywhere else, and it is the shape the 2026-08-30 sweep found
                nine cards' worth of in data/neutral.js.

Exit code 1 if any listener names a hook nothing fires.
"""
import os, re, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "game", "src")

DISPATCH = re.compile(r"hooks\.(?:dispatch|reduce|any|veto)\(\s*['\"]([A-Za-z][\w:]*)['\"]")
# Dispatched under a COMPUTED name, so no literal sits at the call site.
# `CombatEngine._tickStatuses` does
#     const hookName = phase === 'turnStart' ? 'onTurnStart' : 'onTurnEnd';
#     this.hooks.dispatch(hookName, ...)
# Both are real. Anything added here needs its call site named beside it, or
# the allowlist quietly becomes the place misspellings go to hide.
COMPUTED_DISPATCH = {"onTurnStart", "onTurnEnd"}
ADD = re.compile(r"hooks\.add\(\s*['\"]([A-Za-z][\w:]*)['\"]")
# `fire(c, name)` and `fireCompanionHook(c, name)` are BOTH real dispatch sites.
# Matching only the first made a live Marmalade Power (always-lands, listening on
# ghoststepConsumed) look unreachable — a false alarm from a gate is as costly as
# a miss, because the next person learns to ignore it.
FIRE = re.compile(r"\bfire(?:CompanionHook)?\(\s*\w+\s*,\s*['\"]([A-Za-z][\w:]*)['\"]")
COMMENT = re.compile(r"^\s*(//|\*|/\*)")
ONHOOK = re.compile(r"\bonHook\(\s*['\"]([A-Za-z][\w:]*)['\"]")
# Statuses, relics and enemy defs declare their hooks as object keys under
# `hooks: { name: ... }`; a card declares `handHooks: { ... }`.
HOOKS_BLOCK = re.compile(r"\b(?:hooks|handHooks)\s*:\s*\{")
HOOK_KEY = re.compile(r"([A-Za-z_]\w*)\s*(?:\(|:)")


def declared_hooks(text, brace):
    r"""Top-level keys of the object literal whose '{' is at `brace`.

    A real (small) scan rather than a line regex, because the previous attempt
    at this lived at the top of the file and was never called: hook bodies are
    full of braces, strings and comments, and `^\s*name:` matches half the
    fields of every def in the game. Strings, template literals and comments are
    skipped so only structural braces move the depth.
    """
    i, depth, n, keys = brace, 0, len(text), []
    while i < n:
        ch = text[i]
        if ch in "'\"`":
            q, i = ch, i + 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == q:
                    break
                i += 1
            i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            i = text.find("\n", i)
            if i < 0:
                break
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            i = (j + 2) if j >= 0 else n
            continue
        if ch == "{":
            depth += 1
            i += 1
            continue
        if ch == "}":
            depth -= 1
            i += 1
            if depth == 0:
                return keys
            continue
        if depth == 1 and (ch.isalpha() or ch == "_"):
            m = HOOK_KEY.match(text, i)
            if m:
                k = i - 1
                while k >= 0 and text[k] in " \t\r\n":
                    k -= 1
                # a KEY position: the first thing after '{' or after a ','
                if k >= 0 and text[k] in "{,":
                    keys.append((m.group(1), text.count("\n", 0, i) + 1))
                i = m.end()
                continue
        i += 1
    return keys


def js_files():
    for base, _dirs, files in os.walk(SRC):
        for fn in files:
            if fn.endswith(".js"):
                yield os.path.join(base, fn)


def main():
    dispatched, fired = set(), set()
    listeners, companion_listeners, declared = [], [], []
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
        for m in HOOKS_BLOCK.finditer(text):
            for name, ln in declared_hooks(text, m.end() - 1):
                declared.append((rel, ln, name, text.split("\n")[ln - 1].strip()))

    dispatched |= COMPUTED_DISPATCH
    problems = []
    for rel, ln, name, line in listeners:
        if name not in dispatched:
            problems.append((rel, ln, name, line, "engine", sorted(dispatched)))
    for rel, ln, name, line in declared:
        if name not in dispatched:
            problems.append((rel, ln, name, line, "declared", sorted(dispatched)))
    for rel, ln, name, line in companion_listeners:
        if name not in fired:
            problems.append((rel, ln, name, line, "companion", sorted(fired)))

    for rel, ln, name, line, kind, known in problems:
        print(f"  {rel}:{ln}")
        print(f"      {line[:110]}")
        near = [k for k in known if k.lower().startswith(name.lower()[:4])] or known[:6]
        print(f"      -> nothing dispatches the {kind} hook \"{name}\". Did you mean: {', '.join(near[:6])}")

    print(f"RESULT: {len(files)} files, {len(dispatched)} engine hooks, {len(fired)} companion hooks, "
          f"{len(listeners) + len(companion_listeners)} listeners, {len(declared)} declared, "
          f"{len(problems)} unknown")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
