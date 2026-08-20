"""One-off: rename display terms to match the design doc.

Pluck -> Nerve, Trinkets -> Lost Things. Only touches word-boundary occurrences of the
capitalised display term and the exact quoted lowercase id, never identifiers like
`pluck_` or `_pluckV` (those are unrelated shader/variable names).
"""
import re, sys, os

SKIP_DIRS = {"vendor", "node_modules", ".git"}
# Files currently owned by a running agent — leave them to their owner.
SKIP_FILES = {
    "game/src/combat/actor.js", "game/src/combat/engine.js", "game/src/combat/preview.js",
    "game/src/combat/statuses.js", "game/src/combat/damage.js", "game/src/combat/piles.js",
    "game/src/combat/intents.js", "game/src/combat/hooks.js", "game/src/combat/events.js",
    "game/src/combat/dummy.js", "game/src/data/keywords.js", "game/src/data/statuses.js",
    "game/src/scenes/combat.js", "game/src/scenes/combat.css",
    "game/src/ui/enemy.js", "game/src/ui/intent.js", "game/src/fx/combatfx.js",
}

RULES = [
    (re.compile(r"\bPluck\b"), "Nerve"),
    (re.compile(r"(?<=['\"])pluck(?=['\"])"), "nerve"),
    (re.compile(r"\bTrinkets\b"), "Lost Things"),
    (re.compile(r"(?<=['\"])trinkets(?=['\"])"), "lostThings"),
]

changed = []
for root, dirs, files in os.walk("game/src"):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for fn in files:
        if not fn.endswith((".js", ".css", ".html")):
            continue
        p = os.path.join(root, fn).replace("\\", "/")
        if p in SKIP_FILES:
            continue
        s = open(p, encoding="utf-8").read()
        o = s
        for rx, rep in RULES:
            s = rx.sub(rep, s)
        if s != o:
            open(p, "w", encoding="utf-8").write(s)
            changed.append((p, sum(1 for _ in re.finditer(r"Nerve|Lost Things", s))))

for p, n in changed:
    print(f"{p}  ({n} terms)")
print(f"\n{len(changed)} files updated")
