"""CONTRACTS trap 19, gated: `ev.card` is a SNAPSHOT, never the runtime card.

    python tests/snapshot-cards/check.py [--verbose]

`engine.cardSnap()` returns a plain object — uid, id, name, cost, a *cloned*
`meta`, and no `def`.  Every combat event that carries a card carries one of
those, so anything a content author does to `ev.card` that is not a plain READ
lands on a dead copy:

  * writing to it (`card.unplayable = true`) mutates the copy and the real card
    in the pile is untouched.  SILENT.
  * handing it to a mover or a flag-setter (`U.toDrawBottom`, `U.setFlag`,
    `e.exhaustCard`) reaches the engine with an object that is in no pile and
    has no `def`, and `costOf` throws on `card.def.dynamicCost`.  LOUD, but only
    on the seeds that draw the card.

Both were live in the shipped game on 2026-08-30 and both were found by the run
harness's bot, not by a suite: `bones/never-really-lost` crashed any fight in
which a Slobbered Trick was played, and Boggle's "an Attack drawn AFTER the ban
went up is banned too" had never banned one.  Six other companions carry a
comment naming this trap, so the knowledge existed and only the gate did not.

The remedy is one line, and it is the one CONTRACTS 19 prints:

    const live = ev.cardUid ? e.card(ev.cardUid) : null;

READS ARE FINE and are not reported.  `ev.card.cost`, `ev.card.type` and
`U.flag(ev.card, 'gummy')` all answer correctly off the snapshot — taffy.js
reads exactly that way on purpose.  Only writes and runtime-card SINKS are
errors, which is what keeps this gate quiet enough to be believed.
"""
import argparse
import pathlib
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCAN = ["game/src/data", "game/src/state", "game/src/combat"]

# Anything that expects a card that is really in a pile.
SINKS = [
    "moveCard", "toDrawTop", "toDrawBottom", "toHand", "toStash",
    "exhaustCard", "discardCard", "buryCard", "bury", "retainCard",
    "setFlag", "clearFlag", "unslobber", "unbury", "setCardCost",
    "modifyCardCost", "setCardMeta", "upgradeCard", "allyMoveCard",
    "spawnInto", "returnToHand",
]
SINK_RE = re.compile(r"(?:^|[^A-Za-z0-9_$.])(?:[A-Za-z0-9_$.]+\.)?(" + "|".join(SINKS) + r")\s*\(")

# `on('name', (ev) => {`  /  `on("name", function (ev) {`
#
# `.on(` AND `?.on?.(`. The first draft of this gate matched only a literal dot
# and printed "1 problem" while blind to bones.js, which subscribes through
# optional chaining and is the file with the crash in it. Prove a gate can SEE
# the file you care about before you trust the number it prints.
HANDLER_RE = re.compile(r"""[.?]\s*on\s*\??\.?\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:async\s*)?(?:function\s*)?\(?\s*(\w+)\s*\)?\s*=?>?\s*\{""")


def block_at(src, open_brace):
    """Source of the {...} starting at `open_brace`, brace-scanned.

    A line regex cannot do this — handlers nest objects, arrow functions and
    template literals — and the hook-names gate reported green for months
    because it tried.
    """
    depth = 0
    i = open_brace
    in_s = None
    esc = False
    while i < len(src):
        ch = src[i]
        if in_s:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_s:
                in_s = None
        elif ch in "'\"`":
            in_s = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return src[open_brace:i + 1]
        i += 1
    return src[open_brace:]


def call_args(src, open_paren):
    """Top-level arguments of the call whose `(` sits at `open_paren`.

    Splitting on the first comma is not enough: every real use of this found so
    far passes the card SECOND (`U.toDrawBottom(c, k)`), and a naive split left
    `k)` on the end of the second argument so the gate matched nothing at all.
    """
    depth = 0
    i = open_paren
    start = open_paren + 1
    args = []
    in_s = None
    esc = False
    while i < len(src):
        ch = src[i]
        if in_s:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_s:
                in_s = None
        elif ch in "'\"`":
            in_s = ch
        elif ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                args.append(src[start:i].strip())
                return [a for a in args if a]
        elif ch == "," and depth == 1:
            args.append(src[start:i].strip())
            start = i + 1
        i += 1
    return []


def aliases_of(body, ev):
    """Names bound to `ev.card` inside one handler body, plus `ev.card` itself."""
    names = {"%s.card" % ev, "%s?.card" % ev}
    for m in re.finditer(r"(?:const|let|var)\s+(\w+)\s*=\s*%s\??\.card\b(?!\s*\.)" % re.escape(ev), body):
        names.add(m.group(1))
    return names


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), s, flags=re.S)
    return re.sub(r"(^|[^:])//[^\n]*", lambda m: m.group(1), s)


def scan_file(path):
    raw = path.read_text(encoding="utf-8", errors="replace")
    src = strip_comments(raw)
    out = []
    for m in HANDLER_RE.finditer(src):
        event, ev = m.group(1), m.group(2)
        body = block_at(src, src.index("{", m.end() - 1))
        names = aliases_of(body, ev)
        for name in sorted(names):
            bare = name.replace("?", "")
            # 1. a WRITE onto the snapshot
            for w in re.finditer(r"\b%s\s*\.\s*(\w+)\s*(?:=[^=]|\+\+|--|\+=|-=)" % re.escape(bare), body):
                out.append((event, name, "writes .%s onto the snapshot" % w.group(1),
                            body[max(0, w.start() - 60):w.end() + 20].strip()))
            # 2. handed to something that needs a card in a pile
            for s in SINK_RE.finditer(body):
                if bare in call_args(body, body.index("(", s.start())):
                    out.append((event, name, "passed to %s()" % s.group(1),
                                body[max(0, s.start() - 40):s.end() + 60].strip()))
    return out


def main(a):
    problems = []
    files = 0
    handlers = 0
    for rel in SCAN:
        for path in sorted((ROOT / rel).rglob("*.js")):
            files += 1
            src = strip_comments(path.read_text(encoding="utf-8", errors="replace"))
            handlers += len(HANDLER_RE.findall(src))
            for event, name, why, snippet in scan_file(path):
                problems.append((path.relative_to(ROOT).as_posix(), event, name, why, snippet))

    print("scanned %d files, %d event handlers" % (files, handlers))
    if a.verbose:
        print("sinks watched: %s" % ", ".join(SINKS))

    seen = set()
    uniq = []
    for p in problems:
        key = (p[0], p[1], p[2], p[3])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(p)

    for path, event, name, why, snippet in uniq:
        print("  !! %s  on('%s')  %s %s" % (path, event, name, why))
        print("     %s" % " ".join(snippet.split())[:140])

    print("\nRESULT: %d snapshot-as-runtime-card uses" % len(uniq))
    return 1 if uniq else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    sys.exit(main(ap.parse_args()))
