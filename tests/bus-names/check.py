"""A bus subscription under a name nothing emits is completely silent.

    python tests/bus-names/check.py

The third registry. `tests/hook-names/check.py` gates the two HOOK registries —
engine hooks against `hooks.dispatch/reduce/any`, companion hooks against
`U.fire` — and says so in its own docstring. Nothing gated `core/bus.js`.

It cost exactly what trap 10 cost. `ui/tooltip.js` subscribed to `scene:enter`
and `scene:exit`; `core/scenes.js` emits `scene:leaving` and `scene:entered`.
Neither subscribed name is emitted anywhere in the repo, so the shared
tooltip's only cross-scene teardown had never once run — and the panel lives in
`#tooltip-layer`, a sibling of `#dom-layer`, so it is not carried away with the
scene root either. `ui/hud.js` carried the same dead name in its EVENTS list.

The failure is invisible in the ordinary way: the subscription registers, the
callback is simply never called, and nothing throws.

Exit code 1 if any subscribed name has no emitter.

── Two INDIRECT shapes, resolved exactly ────────────────────────────────────

A regex for `bus.on('x')` misses a file that subscribes through a local alias
or a list, and both exist here:

    audio.js   const on = (ev, fn) => this._offs.push(bus.on(ev, ...));
               on('damage', ...)
    hud.js     const EVENTS = ['run:start', ...];
               for (const ev of EVENTS) bus.on(ev, () => this.refresh())

Those used to fall to the ADVISORY half, which only matched names carrying a
`run:` / `combat:` / `map:`-style prefix — so bare engine names like 'damage'
and 'block' were invisible to this gate entirely. audio.js had **33 dead
subscriptions** and this file reported nine of them, as advice.

Both shapes are matched by structure, not by guessing: an arrow function whose
FIRST PARAMETER is handed straight to `bus.on`, and a `for (const x of LIST)`
whose loop variable is handed straight to `bus.on`. Anything else is still
advisory.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "game", "src")

# `bus.on('x')`, `b.on('x')`, `this.bus.on('x')`, `ctx.bus?.on?.('x')` …
# The optional `?.` BEFORE the paren matters: `settings.js` emits with
# `ctx?.bus?.emit?.('settings:changed', …)`, and a regex that missed it reported
# four honest subscribers as listening to a dead name.
ON = re.compile(r"\b(?:bus|b)\s*\??\.\s*on\s*\??\.?\s*\(\s*'([^']+)'")
EMIT = re.compile(r"\b(?:bus|b)\s*\??\.\s*(?:emit|fire)\s*\??\.?\s*\(\s*'([^']+)'")
# `bus.on(ev, …)` with a VARIABLE — the HUD keeps its subscriptions in a const
# array. Only files that do this are scanned for bare event-shaped strings, so a
# scene id or a CSS class never lands here.
INDIRECT = re.compile(r"\b(?:bus|b)\s*\??\.\s*on\s*\??\.?\s*\(\s*[A-Za-z_$]")
LISTY = re.compile(r"'((?:run|scene|hud|combat|settings|map|save|audio|net):[A-Za-z0-9_:-]+)'")

# `const on = (ev, fn) => ... bus.on(ev, ...)` — an alias whose FIRST PARAMETER
# is handed straight through. Matched by structure: the parameter name must be
# the same identifier that reaches `bus.on`, so a helper that transforms the
# name (a prefixer, say) does not match and stays advisory.
ALIAS = re.compile(
    r"\b(?:const|let|var)\s+(\w+)\s*=\s*\(\s*(\w+)\s*(?:,[^)]*)?\)\s*=>"
    r"[^;\n]*?\bbus\s*\??\.\s*on\s*\(\s*\2\b")
# `for (const ev of EVENTS) bus.on(ev, ...)`, with EVENTS a literal array.
LOOP = re.compile(r"for\s*\(\s*(?:const|let)\s+(\w+)\s+of\s+(\w+)\s*\)"
                  r"[^{]*\{?[^}]*?\bbus\s*\??\.\s*on\s*\(\s*\1\b", re.S)
ARRAY = r"\b(?:const|let|var)\s+%s\s*=\s*\[(.*?)\]"


def resolved_subscriptions(code):
    """(name, char offset, how) for every subscription reached indirectly."""
    out = []
    for m in ALIAS.finditer(code):
        fn = m.group(1)
        call = re.compile(r"(?<![\w.])" + re.escape(fn) + r"\(\s*'([^']+)'")
        for c in call.finditer(code):
            out.append((c.group(1), c.start(), "%s()" % fn))
    for m in LOOP.finditer(code):
        a = re.search(ARRAY % re.escape(m.group(2)), code, re.S)
        if not a:
            continue
        for name in re.findall(r"'([^']+)'", a.group(1)):
            out.append((name, a.start(), "%s[]" % m.group(2)))
    return out


def js_files():
    for base, _dirs, files in os.walk(SRC):
        for f in files:
            if f.endswith(".js"):
                yield os.path.join(base, f)


def strip_comments(s):
    out, i, n = list(s), 0, len(s)
    while i < n:
        if s[i] == "/" and i + 1 < n and s[i + 1] == "/":
            j = s.find("\n", i)
            j = n if j < 0 else j
            for k in range(i, j):
                out[k] = " "
            i = j
        elif s[i] == "/" and i + 1 < n and s[i + 1] == "*":
            j = s.find("*/", i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if s[k] != "\n":
                    out[k] = " "
            i = j
        else:
            i += 1
    return "".join(out)


def main():
    emitted, listened, listy = set(), {}, {}
    files = 0
    for path in js_files():
        files += 1
        raw = open(path, encoding="utf-8", errors="replace").read()
        src = strip_comments(raw)
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        for m in EMIT.finditer(src):
            emitted.add(m.group(1))
        for m in ON.finditer(src):
            listened.setdefault(m.group(1), []).append(
                (rel, src[:m.start()].count("\n") + 1))
        # The two INDIRECT shapes, resolved exactly — an alias whose first
        # parameter reaches bus.on, and a `for..of` over a literal array. These
        # are subscriptions, so they go in `listened` and they are FATAL.
        for name, pos, how in resolved_subscriptions(src):
            listened.setdefault(name, []).append(
                (rel + "  (via " + how + ")", src[:pos].count("\n") + 1))
        # Namespaced bare strings, but ONLY in a file that subscribes with a
        # variable — otherwise this is a guess rather than a check.
        if not INDIRECT.search(src):
            continue
        for m in LISTY.finditer(src):
            listy.setdefault(m.group(1), []).append(
                (rel, src[:m.start()].count("\n") + 1))

    # THE GATE: a literal `bus.on('x')` whose name nothing emits. Precise.
    bad = [(n, s) for n, s in sorted(listened.items()) if n not in emitted]

    # ADVISORY: event-shaped strings in a file that subscribes with a VARIABLE,
    # and which `resolved_subscriptions` could NOT account for. That set used to
    # carry the HUD's array and audio.js's alias; both are resolved and gated
    # now, so what is left here is genuinely a guess — a name that looks like an
    # event in a file that happens to subscribe indirectly. "Probably" is not a
    # gate: a checker that fails on a guess trains people to ignore it, which is
    # worse than not checking at all. Reported, never fatal.
    soft = [(n, s) for n, s in sorted(listy.items())
            if n not in emitted and n not in listened]

    for name, sites in bad:
        print(f"  DEAD  bus.on('{name}') — nothing emits it")
        for rel, line in sites[:4]:
            print(f"      {rel}:{line}")
    if soft:
        print("\n  advisory — event-shaped names with no emitter, in files that")
        print("  subscribe indirectly. NOT gated; confirm before acting.")
        for name, sites in soft:
            print(f"      '{name}'  {sites[0][0]}:{sites[0][1]}")

    print(f"\nRESULT: {files} files, {len(emitted)} emitted, {len(listened)} subscribed, "
          f"{len(bad)} dead subscriptions, {len(soft)} advisory")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
