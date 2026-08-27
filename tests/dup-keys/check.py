#!/usr/bin/env python3
"""Duplicate keys in the same object literal. OWNER: combat-engine.

    python tests/dup-keys/check.py [--root game/src] [--verbose]

A gate against a whole bug class, in the same family as tests/seams/check.py and
tests/hook-names/check.py.

WHY THIS EXISTS
---------------
`data/bosses/butler.js` declared `onTurnEnd` twice. In a JavaScript object
literal that is not an error and not a warning — the second key silently
replaces the first. The half that expired his Discomposed status was therefore
dead for the entire build, and because `discomposed` is `decay: 'never'` he
stayed Discomposed forever the first time a player earned it: permanently
taking 25% more damage, and permanently unable to announce another House Rule,
which shuts down the Flustered economy the whole boss is built on.

Nothing caught it. The enemy suite was green, the audit was green, and the fight
"worked" — it just stopped being the fight it was designed to be, from the third
turn a good player has, in a way no console output ever mentions. That is the
exact signature of the silent-no-op class this project keeps re-learning.

HOW IT READS THE CODE
---------------------
No parser is available offline (no build step, no node), so this is a scanner:
comments and string bodies are blanked, then braces are walked with a stack.
A `{` is treated as an object literal when the last significant character before
it is one of `= , : ( [ ?`, and as a class body after `class X`. An arrow's `{`
is a function body, so `=>` is deliberately not in that list.
Everything else — function bodies, blocks, `if` — is a plain scope where no keys
are recorded. Inside an object literal, a key is only counted when the previous
significant character is `{` or `,`, which is what makes nested objects, method
bodies and computed keys stay out of each other's way.

`get x` and `set x` are a legitimate pair and are keyed separately.
A `// dup-keys: ok` comment on the line silences a deliberate duplicate.

Exit code 0 only when there are no duplicates.
"""
import argparse
import pathlib
import re
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parents[2]

# A member key at the start of a member: name:  name(  'name':  "name":
# No `^`: this is used with re.match(code, pos), where `^` would only ever match
# at index 0 and silently make the whole scanner find nothing.
KEY_RE = re.compile(
    r"""(?P<pre>(?:static\s+)?(?:async\s+)?(?:\*\s*)?(?:(?P<acc>get|set)\s+)?)
         (?P<name>[A-Za-z_$][A-Za-z0-9_$]*|'[^'\\]*'|"[^"\\]*")
         \s*(?P<sep>[:(])""",
    re.X,
)


def blank_code(src):
    """Replace comment and string BODIES with spaces, keeping length and newlines.

    Length is preserved so every reported line number is the real one.
    """
    out = list(src)
    i, n = 0, len(src)
    tmpl_stack = []          # template-literal depth bookkeeping for ${ }
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            while i < n and src[i] != "\n":
                out[i] = " "
                i += 1
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            out[i] = out[i + 1] = " "
            i += 2
            while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                if src[i] != "\n":
                    out[i] = " "
                i += 1
            if i < n:
                out[i] = " "
                out[i + 1] = " "
                i += 2
            continue
        if c in "'\"":
            quote = c
            i += 1
            while i < n and src[i] != quote:
                if src[i] == "\\":
                    out[i] = " "
                    i += 1
                    if i < n:
                        out[i] = " "
                        i += 1
                    continue
                if src[i] != "\n":
                    out[i] = " "
                i += 1
            i += 1
            continue
        if c == "`":
            # Template literal. `${ … }` holds real code, so it is walked, not blanked.
            i += 1
            depth = 0
            while i < n:
                ch = src[i]
                if ch == "\\":
                    out[i] = " "
                    i += 1
                    if i < n:
                        out[i] = " "
                        i += 1
                    continue
                if ch == "$" and i + 1 < n and src[i + 1] == "{":
                    depth += 1
                    i += 2
                    brace = 1
                    while i < n and brace:
                        if src[i] == "{":
                            brace += 1
                        elif src[i] == "}":
                            brace -= 1
                        i += 1
                    depth -= 1
                    continue
                if ch == "`":
                    i += 1
                    break
                if ch != "\n":
                    out[i] = " "
                i += 1
            continue
        i += 1
    return "".join(out)


def prev_significant(code, i):
    """The last non-whitespace character before index i, and its index."""
    j = i - 1
    while j >= 0 and code[j] in " \t\r\n":
        j -= 1
    return (code[j], j) if j >= 0 else ("", -1)


def scan(path, verbose=False):
    raw = path.read_text(encoding="utf-8")
    code = blank_code(raw)
    lines = raw.splitlines()
    line_of = [0] * (len(raw) + 1)
    ln = 1
    for idx, ch in enumerate(raw):
        line_of[idx] = ln
        if ch == "\n":
            ln += 1
    line_of[len(raw)] = ln

    problems = []
    stack = []           # [{'kind': 'obj'|'block', 'seen': {name: line}}]
    i, n = 0, len(code)
    while i < n:
        c = code[i]
        if c == "{":
            prev, pj = prev_significant(code, i)
            kind = "block"
            # NOT `=>`: an arrow followed by `{` is a function BODY. An arrow
            # that returns an object literal is written `=> ({…})`, which lands
            # on `(` and is caught by the list below.
            if prev in "=,:([?":
                kind = "obj"
                # `case EV.DAMAGE: {` and `default: {` also end in a colon, and
                # they are blocks.
                if prev == ":" and re.search(r"\b(case\b[^;{}]*|default\s*)$", code[:pj]):
                    kind = "block"
            else:
                # `class X {` / `class X extends Y {` is a member list too.
                head = code[max(0, i - 200):i]
                if re.search(r"\bclass\b[^{;]*$", head):
                    kind = "obj"
                elif prev == "" or prev in "{;":
                    kind = "block"
            stack.append({"kind": kind, "seen": {}, "paren": 0, "brack": 0})
            i += 1
            continue
        if c == "}":
            if stack:
                stack.pop()
            i += 1
            continue
        if stack and c in "([":
            stack[-1]["paren" if c == "(" else "brack"] += 1
            i += 1
            continue
        if stack and c in ")]":
            k = "paren" if c == ")" else "brack"
            stack[-1][k] = max(0, stack[-1][k] - 1)
            i += 1
            continue
        # A member sits at the literal's OWN level — not inside an array element
        # and not inside a call's arguments. Without this,
        # `members: [m('dust-bunny'), m('door-greeter')]` reads as two members
        # both called `m`.
        if (stack and stack[-1]["kind"] == "obj"
                and stack[-1]["paren"] == 0 and stack[-1]["brack"] == 0):
            prev, _ = prev_significant(code, i)
            if prev in "{,;" and (c.isalpha() or c in "_$'\""):
                # Matched against the RAW source, not the blanked copy: indices
                # are 1:1, and a quoted key like 'card:draw' has had its body
                # blanked in `code`, which would make every quoted key in a file
                # look like the same run of spaces.
                m = KEY_RE.match(raw, i)
                if m:
                    name = m.group("name").strip("'\"")
                    acc = m.group("acc") or ""
                    key = f"{acc}:{name}" if acc else name
                    line = line_of[i]
                    src_line = lines[line - 1] if line - 1 < len(lines) else ""
                    if "dup-keys: ok" in src_line:
                        pass
                    elif key in stack[-1]["seen"]:
                        problems.append({
                            "file": str(path.relative_to(ROOT)).replace("\\", "/"),
                            "key": name,
                            "first": stack[-1]["seen"][key],
                            "second": line,
                            "text": src_line.strip(),
                        })
                    else:
                        stack[-1]["seen"][key] = line
                    i = m.end()
                    continue
        i += 1
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="game/src")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()

    root = ROOT / a.root
    files = sorted(root.rglob("*.js"))
    problems = []
    for f in files:
        if "/vendor/" in str(f).replace("\\", "/"):
            continue
        problems.extend(scan(f, a.verbose))

    print(f"dup-keys: scanned {len(files)} files under {a.root}")
    if not problems:
        print("RESULT: 0 duplicate keys")
        return 0

    for p in problems:
        print(f"  {p['file']}:{p['second']}  duplicate key '{p['key']}' "
              f"(first declared on line {p['first']})")
        print(f"      {p['text']}")
    print(f"RESULT: {len(problems)} duplicate keys")
    print("A later key SILENTLY replaces the earlier one. Merge them, rename one, "
          "or mark the line `// dup-keys: ok` if the shadowing is deliberate.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
