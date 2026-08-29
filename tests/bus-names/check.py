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
        # Namespaced bare strings, but ONLY in a file that subscribes with a
        # variable — otherwise this is a guess rather than a check.
        if not INDIRECT.search(src):
            continue
        for m in LISTY.finditer(src):
            listy.setdefault(m.group(1), []).append(
                (rel, src[:m.start()].count("\n") + 1))

    # THE GATE: a literal `bus.on('x')` whose name nothing emits. Precise.
    bad = [(n, s) for n, s in sorted(listened.items()) if n not in emitted]

    # ADVISORY: event-shaped strings in a file that subscribes with a VARIABLE.
    # The HUD keeps its subscriptions in a const array, so these are probably
    # dead subscriptions too — but "probably" is not a gate. A checker that
    # fails on a guess trains people to ignore it, which is worse than not
    # checking at all. Reported, never fatal.
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
