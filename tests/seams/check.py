"""Seam checker — static audit of the joins between modules.

    python tests/seams/check.py [--verbose] [--json out.json]

Every module in this build passed its own harness while silently no-opping at
the join (CONTRACTS.md rules 8 and 9).  This scans `game/src/**/*.js` for the
five shapes that produce a silent no-op:

  1. OPTIONAL-CALL   `ctx.foo?.()` on a contract API.  If `foo` is missing the
                     optional chain swallows it and the effect vanishes.
                     Allowed only on presentation namespaces (audio, tooltip…).
  2. UNKNOWN-OPTION  an option key handed to ctx.damage / addCard / summon /…
                     that the receiving implementation never reads
                     (`{pierceBlock:true}` vs `o.pierce || o.ignoreBlock`).
  3. UNKNOWN-SFX     an `audio.play()` / `stinger()` id that the bank cannot
                     resolve.
  4. UNKNOWN-ID      a status / keyword id referenced by content that nothing
                     registers.
  5. UNKNOWN-METHOD  a method called on ctx / engine / run that the
                     implementation does not define.
  6. SHARED-WRITE    a SCREEN assigning to a `Run` field.  Every client
                     simulates the whole expedition, so a screen that writes
                     shared state instead of sending an input through
                     `net/actions.js` makes a change nobody else can see.

The surfaces are READ OUT OF THE SOURCE, never hardcoded: ctxFor() and
enemyCtx() in combat/engine.js, Hooks._payload() in combat/hooks.js, the CUES
and ALIASES tables in audio/sfx.js, and the status/keyword registries.  So the
checker cannot drift away from the code it is checking.

Prints `RESULT: n call sites checked, m problems`.  Exit 1 when m > 0.
"""

import argparse
import json
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "game", "src")

IDENT = r"[A-Za-z_$][A-Za-z0-9_$]*"


# ── source loading ──────────────────────────────────────────────────────────

def js_files():
    out = []
    for base, dirs, files in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in ("vendor", "node_modules")]
        for f in sorted(files):
            if f.endswith(".js"):
                out.append(os.path.join(base, f))
    return sorted(out)


def read(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def rel(path):
    return os.path.relpath(path, ROOT).replace("\\", "/")


def strip_comments(s):
    """Blank out comments and string bodies, preserving offsets and newlines."""
    out = list(s)
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c == "/" and i + 1 < n and s[i + 1] == "/":
            j = s.find("\n", i)
            j = n if j < 0 else j
            for k in range(i, j):
                out[k] = " "
            i = j
        elif c == "/" and i + 1 < n and s[i + 1] == "*":
            j = s.find("*/", i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if out[k] != "\n":
                    out[k] = " "
            i = j
        elif c in "'\"`":
            q = c
            j = i + 1
            while j < n:
                if s[j] == "\\":
                    j += 2
                    continue
                if s[j] == q:
                    break
                j += 1
            j = min(j, n - 1)
            for k in range(i + 1, j):
                if out[k] != "\n":
                    out[k] = " "
            i = j + 1
        else:
            i += 1
    return "".join(out)


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


# ── balanced-scan helpers ───────────────────────────────────────────────────

def match_brace(s, i, open_ch="{", close_ch="}"):
    """`i` points at open_ch. Returns index just past the matching close."""
    depth = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return n


def top_level_keys(obj_src):
    """Top-level key names of an object literal `{...}` (source with comments
    already stripped).  Ignores nested objects, arrays and function bodies.

    Both `key: value` and ES6 shorthand `key,` count. Shorthand used to be
    invisible, which made the gate believe the `damage` event never carries
    `kind` -- it is emitted as a bare `kind,` -- and report every honest reader
    of it as reading a field that does not exist.

    Reading shorthand means the scanner has to skip past VALUES as well, or
    `{ defender: enemy, amount: d }` reports `enemy` and `d` as keys too.
    """
    keys = []
    depth = 0
    i = 1
    n = len(obj_src) - 1
    while i < n:
        c = obj_src[i]
        if c in "{[(":
            depth += 1
            i += 1
            continue
        if c in "}])":
            depth -= 1
            i += 1
            continue
        if depth != 0 or (i != 1 and obj_src[i - 1] not in " \t\n,{"):
            i += 1
            continue
        m = re.match(r"(?:\.\.\.)?(" + IDENT + r"|'[^']*'|\"[^\"]*\")\s*:", obj_src[i:])
        if m:
            keys.append(m.group(1).strip("'\""))
            # step over the value, or its identifier is read as a key as well
            j = i + m.end()
            d2 = 0
            while j < n:
                ch = obj_src[j]
                if ch in "{[(":
                    d2 += 1
                elif ch in "}])":
                    if d2 == 0:
                        break
                    d2 -= 1
                elif ch == "," and d2 == 0:
                    break
                j += 1
            i = j
            continue
        sh = re.match(r"(" + IDENT + r")\s*(?=[,}])", obj_src[i:])
        if sh:
            keys.append(sh.group(1))
            i += sh.end()
            continue
        if obj_src[i:i + 3] == "...":
            keys.append("...")
            i += 3
            continue
        i += 1
    return keys

def call_args(s, open_paren):
    """Split the argument list of a call whose '(' is at `open_paren`.
    Returns (list_of_(arg_src, abs_start), index_past_close)."""
    end = match_brace(s, open_paren, "(", ")")
    inner = s[open_paren + 1:end - 1]
    args, depth, start = [], 0, 0
    for i, c in enumerate(inner):
        if c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
        elif c == "," and depth == 0:
            args.append((inner[start:i], open_paren + 1 + start))
            start = i + 1
    if inner.strip():
        args.append((inner[start:], open_paren + 1 + start))
    return args, end


# ── surface extraction (all read from source) ───────────────────────────────

def object_literal_keys_of_method(src, method_sig):
    """Find `method_sig` … `return <maybe a wrapper>({ … })` and return that
    literal's top-level keys. The returned object may be wrapped (the dev seam
    guard returns `this._guardCtx({…})`), so match the first `{` after `return`
    rather than insisting on a bare `return {`."""
    m = re.search(method_sig, src)
    if not m:
        return set()
    ret = re.search(r"\n\s*return[^\n{;]*\{", src[m.end():])
    if not ret:
        return set()
    brace = m.end() + ret.end() - 1
    body = src[brace:match_brace(src, brace)]
    return {k for k in top_level_keys(body) if k != "..."}


def class_members(src, class_name):
    """Method names + `this.x =` fields of a class."""
    m = re.search(r"class\s+" + class_name + r"\b[^{]*\{", src)
    if not m:
        return set()
    start = src.index("{", m.start())
    body = src[start:match_brace(src, start)]
    names = set()
    for mm in re.finditer(r"^\s{2}(?:async\s+|get\s+|set\s+|static\s+)*(" + IDENT + r")\s*\(", body, re.M):
        names.add(mm.group(1))
    for mm in re.finditer(r"^\s{2}(" + IDENT + r")\s*=", body, re.M):
        names.add(mm.group(1))
    for mm in re.finditer(r"this\.(" + IDENT + r")\s*=", body):
        names.add(mm.group(1))
    return names


class Surfaces:
    def __init__(self):
        eng_raw = read(os.path.join(SRC, "combat", "engine.js"))
        eng = strip_comments(eng_raw)
        hooks = strip_comments(read(os.path.join(SRC, "combat", "hooks.js")))
        actor = strip_comments(read(os.path.join(SRC, "combat", "actor.js")))
        run = strip_comments(read(os.path.join(SRC, "state", "run.js")))
        piles = strip_comments(read(os.path.join(SRC, "combat", "piles.js")))
        audio = strip_comments(read(os.path.join(SRC, "audio", "audio.js")))

        self.card_ctx = object_literal_keys_of_method(eng, r"\n  ctxFor\s*\(")
        # engine._playCard bolts one more helper onto the ctx it just built
        self.card_ctx |= set(re.findall(r"\bctx\.(" + IDENT + r")\s*=", eng))
        self.enemy_ctx = object_literal_keys_of_method(eng, r"\n  enemyCtx\s*\(")
        self.hook_payload = object_literal_keys_of_method(hooks, r"\n  _payload\s*\(")
        # hook payloads are `{...payload, …}` — the per-hook extras the engine
        # spreads in are collected from every dispatch/reduce/any call site.
        self.hook_payload |= self._dispatch_keys(eng) | self._dispatch_keys(
            strip_comments(read(os.path.join(SRC, "combat", "damage.js"))))

        self.engine = class_members(eng, "CombatEngine")
        self.actor = class_members(actor, "Actor") | class_members(actor, "Player") | class_members(actor, "Enemy")
        self.run = class_members(run, "Run") | class_members(run, "RunState")
        self.piles = class_members(piles, "Piles")
        self.audio = class_members(audio, "Audio")

        self.event_fields = self._event_fields()
        self.status_defs = self._status_defs()
        self.cues, self.aliases = self._sfx_bank()
        self.statuses = self._status_ids()
        self.keywords = self._keyword_ids()
        self.card_ids = self._card_ids()
        self.option_keys = self._option_keys()

    # -- hook payload extras -------------------------------------------------
    def _dispatch_keys(self, src):
        keys = set()
        for m in re.finditer(r"hooks\.(?:dispatch|reduce|any)\s*\(", src):
            args, _ = call_args(src, src.index("(", m.end() - 1))
            for a, _p in args:
                a = a.strip()
                if a.startswith("{"):
                    keys |= {k for k in top_level_keys(a) if k != "..."}
        # object payloads built as a named const then dispatched
        for name in ("hookPayload", "inc", "le", "hCtx"):
            for m in re.finditer(r"\bconst\s+" + name + r"\s*=\s*\{", src):
                b = src.index("{", m.end() - 1)
                keys |= {k for k in top_level_keys(src[b:match_brace(src, b)]) if k != "..."}
        return keys

    # -- combat event payloads (what `engine.on(type, ev => …)` really gets) --
    def _event_fields(self):
        ev = strip_comments_keep_strings(read(os.path.join(SRC, "combat", "events.js")))
        m = re.search(r"export const EV\s*=[^{]*\{", ev)
        b = ev.index("{", m.end() - 1)
        names = dict(re.findall(r"(" + IDENT + r")\s*:\s*'([^']+)'", ev[b:match_brace(ev, b)]))
        fields = {}
        for f in ("engine.js", "damage.js", "piles.js", "intents.js", "choice.js"):
            p = os.path.join(SRC, "combat", f)
            if not os.path.exists(p):
                continue
            s = strip_comments(read(p))
            for m in re.finditer(r"_emit\s*\(\s*EV\.(" + IDENT + r")\s*,\s*\{", s):
                ename = names.get(m.group(1))
                if not ename:
                    continue
                b = s.index("{", m.end() - 1)
                keys = {k for k in top_level_keys(s[b:match_brace(s, b)]) if k != "..."}
                fields.setdefault(ename, set()).update(keys)
        for k in fields:
            fields[k] |= {"type", "seq", "turn"}
        return fields

    # -- status defs, so an inert marker status can be spotted ---------------
    def _status_defs(self):
        defs = {}
        for f in (os.path.join(SRC, "combat", "statuses.js"),
                  os.path.join(SRC, "data", "companions", "keywords.js"),
                  os.path.join(SRC, "data", "enemies", "_lib.js")):
            s = strip_comments_keep_strings(read(f))
            for m in re.finditer(r"\{\s*\n?\s*id:\s*'([^']+)'", s):
                b = s.rindex("{", 0, m.end())
                body = s[b:match_brace(s, b)]
                defs[m.group(1)] = {
                    "hooks": "hooks:" in body,
                    "pipeline": "pipeline:" in body,
                    "resource": "resource: true" in body or "resource:true" in body,
                }
            for m in re.finditer(r"counterStatus\('([^']+)'", s):
                defs[m.group(1)] = {"hooks": False, "pipeline": False, "resource": True}
            # id-keyed tables (UNIVERSAL_STATUSES)
            for m in re.finditer(r"^  (" + IDENT + r"):\s*\{", s, re.M):
                b = s.index("{", m.end() - 1)
                body = s[b:match_brace(s, b)]
                if "kind:" in body:
                    defs[m.group(1)] = {"hooks": "hooks:" in body,
                                        "pipeline": "pipeline:" in body,
                                        "resource": False}
        return defs

    # -- audio bank ----------------------------------------------------------
    def _sfx_bank(self):
        s = strip_comments_keep_strings(read(os.path.join(SRC, "audio", "sfx.js")))
        m = re.search(r"export const CUES\s*=\s*\{", s)
        body = s[s.index("{", m.end() - 1):match_brace(s, s.index("{", m.end() - 1))]
        cues = set()
        depth = 0
        for i, c in enumerate(body):
            if c in "{[(":
                depth += 1
            elif c in "}])":
                depth -= 1
            elif depth == 1 and c == "'":
                j = body.index("'", i + 1)
                if re.match(r"\s*:", body[j + 1:j + 4]):
                    cues.add(body[i + 1:j])
        m = re.search(r"export const ALIASES\s*=\s*\{", s)
        b = s.index("{", m.end() - 1)
        abody = s[b:match_brace(s, b)]
        aliases = dict(re.findall(r"(" + IDENT + r"|'[^']+')\s*:\s*'([^']+)'", abody))
        aliases = {k.strip("'"): v for k, v in aliases.items()}
        return cues, aliases

    def resolve_sfx(self, sid):
        """Mirror of audio/sfx.js resolveId()."""
        if sid in self.cues:
            return sid
        if sid in self.aliases:
            return self.aliases[sid]
        slash = sid.replace("/", ":")
        if slash in self.cues:
            return slash
        if slash in self.aliases:
            return self.aliases[slash]
        bare = slash.split(":", 1)[1] if ":" in slash else slash
        for k in sorted(self.cues):
            if k.split(":", 1)[1] == bare:
                return k
        return None

    # -- registries ----------------------------------------------------------
    def _status_ids(self):
        ids = set()
        s = strip_comments_keep_strings(read(os.path.join(SRC, "combat", "statuses.js")))
        m = re.search(r"UNIVERSAL_STATUSES\s*=\s*\{", s)
        b = s.index("{", m.end() - 1)
        ids |= {k for k in top_level_keys(s[b:match_brace(s, b)]) if k != "..."}
        for f, var in (
            (os.path.join(SRC, "data", "companions", "keywords.js"), "COMPANION_STATUSES"),
            (os.path.join(SRC, "data", "enemies", "_lib.js"), "ENEMY_STATUSES"),
        ):
            s = strip_comments_keep_strings(read(f))
            m = re.search(var + r"\s*=\s*\[", s)
            if not m:
                continue
            b = s.index("[", m.end() - 1)
            body = s[b:match_brace(s, b, "[", "]")]
            ids |= set(re.findall(r"\bid:\s*'([^']+)'", body))
            ids |= set(re.findall(r"counterStatus\('([^']+)'", body))
        # powers registered at runtime via ctx.addPower({ id: … })
        for path in js_files():
            body = strip_comments_keep_strings(read(path))
            for m in re.finditer(r"addPower\s*\(\s*\{", body):
                b = body.index("{", m.end() - 1)
                lit = body[b:match_brace(body, b)]
                ids |= set(re.findall(r"\bid:\s*'([^']+)'", lit))
            ids |= set(re.findall(r"registerStatus\s*\(\s*\{\s*id:\s*'([^']+)'", body))
            ids |= set(re.findall(r"POWER_ID\s*=\s*'([^']+)'", body))
        return ids

    def _keyword_ids(self):
        ids = set(self.statuses)
        s = strip_comments_keep_strings(read(os.path.join(SRC, "data", "keywords.js")))
        ids |= set(re.findall(r"\bK\('([^']+)'", s))
        s = strip_comments_keep_strings(read(os.path.join(SRC, "data", "companions", "keywords.js")))
        ids |= set(re.findall(r"\bK\('([^']+)'", s))
        return ids

    def _card_ids(self):
        ids = set()
        for path in js_files():
            if "/data/" not in rel(path):
                continue
            s = strip_comments_keep_strings(read(path))
            ids |= set(re.findall(r"^\s*id:\s*'([^']+)'", s, re.M))
        return ids

    def _option_keys(self):
        """Which option keys each receiving implementation actually reads."""
        dmg = strip_comments(read(os.path.join(SRC, "combat", "damage.js")))
        eng = strip_comments(read(os.path.join(SRC, "combat", "engine.js")))
        damage_keys = set(re.findall(r"\bo\.(" + IDENT + r")", dmg))
        # ctx.damage / enemyCtx.damage read a couple themselves before spreading
        damage_keys |= set(re.findall(r"\bopts\.(" + IDENT + r")", eng[
            eng.find("ctxFor(card, target"):eng.find("ctxFor(card, target") + 3000] or ""))
        damage_keys |= {"target"}          # enemyCtx.damageMulti reads opts.target
        return {
            "damage": damage_keys,
            "damageAll": damage_keys,
            "damageMulti": damage_keys,
            "dealDamage": damage_keys,
            "hit": damage_keys,            # _util wrappers forward straight through
            "hitN": damage_keys,
            "hitAt": damage_keys,
            "hitAll": damage_keys,
            "hitAllN": damage_keys,
            "hitRandom": damage_keys,
            "hitRandomN": damage_keys,
            "addCard": self._reads(eng, r"\n  addCard\s*\(def", "opts"),
            "summon": self._reads(eng, r"\n  summon\s*\(", "opts"),
            "gainBlock": self._reads(eng, r"\n  gainBlock\s*\(", "opts"),
            "block": self._reads(eng, r"\n  gainBlock\s*\(", "opts"),
        }

    def _reads(self, src, sig, param):
        """Which `param.key`s a method actually reads, from its real body.

        This used to take `src.index("{", m.end())` as the start of the body.
        Every one of these methods ends its parameter list with a DEFAULT of
        `{}` — `addCard(def, pile = Pile.HAND, opts = {})`, `summon(def, o = {})`,
        `gainBlock(actor, amount, opts = {})` — so the first brace after the
        signature was that default, `match_brace` returned the two characters
        `{}`, and the key set came back EMPTY. `check_option_keys` then does
        `if not allowed: continue`, so four of the five APIs this gate advertises
        were skipped in silence while it printed a confident four-figure
        call-site count. Only the damage family, built separately from a plain
        `o.` regex over damage.js, was ever really checked.

        Walk the parameter list to its closing paren first; the body is the
        brace after that.
        """
        m = re.search(sig, src)
        if not m:
            return set()
        p = src.index("(", m.start())
        depth, i = 0, p
        while i < len(src):
            if src[i] == "(":
                depth += 1
            elif src[i] == ")":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        b = src.index("{", i)
        body = src[b:match_brace(src, b)]
        keys = set(re.findall(r"\b" + param + r"\.(" + IDENT + r")", body))

        # An option FORWARDED whole to a helper is still read. `gainBlock` hands
        # `opts` straight to `previewBlockValue`, which is where `fromCard` and
        # `source` are consumed — without this, eight honest call sites are
        # reported as passing keys nobody reads. One level is enough for every
        # forward in this engine; a second would need a real call graph.
        for fwd in re.findall(r"this\.(" + IDENT + r")\s*\([^()]*\b" + param + r"\s*\)", body):
            m2 = re.search(r"\n  " + re.escape(fwd) + r"\s*\(", src)
            if not m2 or fwd == sig:
                continue
            try:
                p2 = src.index("(", m2.start())
                d2, j = 0, p2
                while j < len(src):
                    if src[j] == "(":
                        d2 += 1
                    elif src[j] == ")":
                        d2 -= 1
                        if d2 == 0:
                            break
                    j += 1
                b2 = src.index("{", j)
                inner = src[b2:match_brace(src, b2)]
                # The helper names its own parameter; take whatever it destructures
                # or dots off the object in the same position.
                for pn in set(re.findall(r"\b(" + IDENT + r")\s*=\s*\{\s*\}", src[p2:j])):
                    keys |= set(re.findall(r"\b" + pn + r"\.(" + IDENT + r")", inner))
            except ValueError:
                continue
        return keys


def strip_comments_keep_strings(s):
    """Blank comments only — string contents survive (needed to read id tables)."""
    out = list(s)
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c == "/" and i + 1 < n and s[i + 1] == "/":
            j = s.find("\n", i)
            j = n if j < 0 else j
            for k in range(i, j):
                out[k] = " "
            i = j
        elif c == "/" and i + 1 < n and s[i + 1] == "*":
            j = s.find("*/", i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if out[k] != "\n":
                    out[k] = " "
            i = j
        elif c in "'\"`":
            q = c
            j = i + 1
            while j < n:
                if s[j] == "\\":
                    j += 2
                    continue
                if s[j] == q:
                    break
                j += 1
            i = min(j, n - 1) + 1
        else:
            i += 1
    return "".join(out)


# ── which surface applies to which file ─────────────────────────────────────

ENEMY_DIRS = ("game/src/data/enemies/", "game/src/data/bosses/")
CARD_DIRS = ("game/src/data/companions/", "game/src/data/cards.js",
             "game/src/data/neutral.js")

# `?.` is fine on these: their absence is harmless (CONTRACTS rule 8).
PRESENTATION = {
    "audio", "atmosphere", "tooltip", "transition", "fx", "tipLayer", "stage",
    "input", "assets", "dom", "scenes", "Save", "renderer", "combatfx",
    "backdrop", "clock", "bus", "def", "meta", "el", "node", "canvas", "style",
    # plain collections whose Map/Array methods collide with ctx method names
    # (`engine.counters.has`, `engine.enemies.find`, `scenes.registry.has`)
    "counters", "statuses", "powers", "registry", "enemies", "allies", "objects",
    "timers", "rules", "field", "piles", "hand", "deck", "keepsakes", "relics",
    "nodes", "settings", "history",
}
# methods whose absence is genuinely optional (content-supplied callbacks)
OPTIONAL_METHODS = {
    "effect", "onSpawn", "onDeath", "onDamaged", "onAttacked", "onTurnStart",
    "onTurnEnd", "onPlayerCard", "onCardPlayed", "onAllyDeath", "onBoardEvent",
    "onRuleBroken", "onBreak", "onPlayerTurnEnd", "onEnemyPhaseEnd", "playable",
    "dynamicCost", "damageFn", "hitsFn", "blockFn", "intentFn", "alternatives",
    "onFrame", "then", "catch", "unlock", "play", "music", "stinger", "impact",
    "show", "hide", "applySettings", "setSetting",
}

CTXLIKE = {"c", "ctx", "cx", "c2"}
HOOK_FILES = ("game/src/combat/statuses.js", "game/src/data/relics.js",
              "game/src/data/companions/keywords.js", "game/src/data/enemies/_lib.js")


def run_fields():
    """Every field a `Run` owns, read out of `state/run.js` itself.

    The constructor's own `this.x =` assignments plus the PER_KID accessor list,
    so the set cannot drift away from the class it is describing — the same rule
    the other five surfaces here follow.  `_private` names are skipped: a screen
    reaching for one of those is a different (louder) kind of wrong, and the
    checker should not be the thing that finds it.
    """
    path = os.path.join(SRC, "state", "run.js")
    code = strip_comments(read(path))            # comments AND string bodies out
    lit = strip_comments_keep_strings(read(path))  # strings kept, for PER_KID
    i = code.index("constructor(")
    # NOT `code.index('{', i)` — the signature is `constructor(cfg = {})` and
    # that finds the default argument's own braces, which produced a field set
    # of exactly nothing and a check that passed by looking at an empty list.
    body = code.index("{", match_brace(code, code.index("(", i), "(", ")") - 1)
    ctor = code[body:match_brace(code, body)]
    fields = set(re.findall(r"this\.(" + IDENT + r")\s*=", ctor))
    per = re.search(r"const PER_KID\s*=\s*\[(.*?)\]", lit, re.S)
    if per:
        fields |= set(re.findall(r"'([A-Za-z_$][\w$]*)'", per.group(1)))
    return {f for f in fields if not f.startswith("_")}


def guarded(src, pos, recv, meth):
    """True when the call sits behind an explicit feature test — a legitimate
    `if (c.foo) c.foo(…)` fallback rather than a silent `c.foo?.()`."""
    window = src[max(0, pos - 240):pos]
    pat = re.escape(recv) + r"\." + re.escape(meth)
    return bool(re.search(r"typeof\s+" + pat + r"\s*===?", window)
                or re.search(r"if\s*\(\s*!?" + pat + r"\s*[)&|]", window)
                or re.search(pat + r"\s*\?[^.]", window))


class Checker:
    def __init__(self, surf):
        self.s = surf
        self.problems = []
        self.sites = 0

    def add(self, kind, path, line, msg):
        self.problems.append({"kind": kind, "file": rel(path), "line": line, "msg": msg})

    # -- which method set does `recv` promise in this file? -------------------
    def surface_for(self, path, recv):
        """`e` is an engine inside combat/, a DOM event inside scenes/ and ui/;
        `h` is a hook payload only in the files that define hooks. Guessing wider
        than that produces noise, and a noisy checker gets ignored."""
        r = rel(path)
        head, _, tail = recv.rpartition(".")
        if tail in ("e", "engine") and (head in CTXLIKE or head in ("this", "")):
            if head == "" and not r.startswith("game/src/combat/"):
                return None, None
            return "engine", self.s.engine | self.s.actor | self.s.piles
        if recv in ("run", "this.run") or (head in CTXLIKE and tail == "run"):
            return "run", self.s.run
        if recv == "h" and r in HOOK_FILES:
            return "hook payload", self.s.hook_payload | self.s.engine
        if recv in CTXLIKE:
            if r.startswith(ENEMY_DIRS):
                return "enemy ctx", self.s.enemy_ctx | self.s.hook_payload
            if r in HOOK_FILES:
                return "hook payload", self.s.hook_payload
            if r.startswith(CARD_DIRS):
                return "card ctx", self.s.card_ctx | self.s.hook_payload
        return None, None

    # -- 1. optional calls on contract APIs ----------------------------------
    def check_optional_calls(self, path, src):
        """`a?.b?.c?.()` defeats a plain member-chain regex, so `?.` is first
        rewritten to a same-length marker: `?.(` → `!!(` (optional CALL) and any
        other `?.` → `~.` (optional member). Offsets are preserved exactly."""
        known = (self.s.card_ctx | self.s.enemy_ctx | self.s.hook_payload
                 | self.s.engine | self.s.run | self.s.actor | self.s.piles)
        norm = re.sub(r"\?\.\(", "!!(", src).replace("?.", "~.")
        chain = r"(" + IDENT + r"(?:~?\." + IDENT + r")*)"
        seen = set()

        def report(m, recv, meth, form):
            root = re.split(r"~?\.", recv)[0]
            base = re.split(r"~?\.", recv)[-1]
            self.sites += 1
            if base in PRESENTATION or meth in OPTIONAL_METHODS or meth not in known:
                return
            if root not in CTXLIKE and root not in ("engine", "e", "this", "run", "self"):
                return
            if root in ("e", "this") and not rel(path).startswith(
                    ("game/src/combat/", "game/src/data/")):
                return
            if m.start() in seen:
                return
            seen.add(m.start())
            self.add("OPTIONAL-CALL", path, line_of(src, m.start()),
                     "%s — contract API behind an optional chain (rule 8)"
                     % (form % (recv.replace("~", "?"), meth)))

        for m in re.finditer(chain + r"~?\.(" + IDENT + r")!!\(", norm):
            report(m, m.group(1), m.group(2), "%s.%s?.()")
        for m in re.finditer(chain + r"~\.(" + IDENT + r")\s*\(", norm):
            report(m, m.group(1), m.group(2), "%s?.%s()")

    # -- 2. option keys the receiver never reads -----------------------------
    def check_option_keys(self, path, src):
        for api, allowed in self.s.option_keys.items():
            if not allowed:
                continue
            # A file that defines its OWN method of this name is not calling the
            # engine's. `state/run.js` has `addCard(defOrId, { upgraded, quiet })`,
            # a different method with a different contract, and matching its call
            # sites against the engine's key set reports `quiet` — which run.js
            # reads perfectly well — plus a phantom `false` off the destructured
            # default. Checking a call against the wrong implementation is worse
            # than not checking it.
            if re.search(r"\n\s*" + re.escape(api) + r"\s*\([^)]*\)\s*\{", src):
                continue
            for m in re.finditer(r"(?:^|[^A-Za-z0-9_$.])(?:" + IDENT + r"\.)?" +
                                 re.escape(api) + r"\??\.?\(", src):
                op = src.index("(", m.end() - 1)
                args, _ = call_args(src, op)
                for a, pos in args:
                    a = a.strip()
                    if not a.startswith("{") or not a.endswith("}"):
                        continue
                    self.sites += 1
                    for k in top_level_keys(a):
                        if k in ("...", "") or k in allowed:
                            continue
                        self.add("UNKNOWN-OPTION", path, line_of(src, pos),
                                 "%s({ %s: … }) — the implementation never reads `%s` "
                                 "(reads: %s)" % (api, k, k, ", ".join(sorted(allowed))))

    # -- 3. sfx ids ----------------------------------------------------------
    def check_sfx(self, path, src_str):
        for m in re.finditer(r"\.(play|stinger|sfx)\??\.?\s*\(\s*'([^']+)'", src_str):
            self.sites += 1
            sid = m.group(2)
            if m.group(1) == "stinger":
                if (self.s.resolve_sfx(sid) or self.s.resolve_sfx("sting:" + sid)):
                    continue
            elif self.s.resolve_sfx(sid):
                continue
            self.add("UNKNOWN-SFX", path, line_of(src_str, m.start()),
                     "%s('%s') — no such cue in the sfx bank" % (m.group(1), sid))
        # `domain/name` spelling: resolvable, but the bank speaks `domain:name`
        for m in re.finditer(r"\.(?:play|stinger)\??\.?\s*\(\s*'([a-z]+)/([a-z-]+)'", src_str):
            self.add("SFX-SEPARATOR", path, line_of(src_str, m.start()),
                     "'%s/%s' uses `/` — the bank is keyed `%s:%s`"
                     % (m.group(1), m.group(2), m.group(1), m.group(2)))

    # -- 4. status / keyword ids ---------------------------------------------
    def check_ids(self, path, src_str):
        r = rel(path)
        if not r.startswith("game/src/data/"):
            return
        for m in re.finditer(r"\b(?:applyStatus|buff|debuff|removeStatus|apply|applySelf"
                             r"|applyAll|unapply)\s*\(", src_str):
            args, _ = call_args(src_str, src_str.index("(", m.end() - 1))
            for a, pos in args:
                lit = re.fullmatch(r"\s*'([a-z][a-z0-9/-]*)'\s*", a)
                if not lit:
                    continue
                sid = lit.group(1)
                self.sites += 1
                if sid in self.s.statuses or sid in self.s.card_ids:
                    continue
                self.add("UNKNOWN-ID", path, line_of(src_str, pos),
                         "status '%s' is applied but never registered" % sid)
        for m in re.finditer(r"keywords:\s*\[([^\]]*)\]", src_str):
            for kw in re.findall(r"'([^']+)'", m.group(1)):
                self.sites += 1
                if kw not in self.s.keywords:
                    self.add("UNKNOWN-ID", path, line_of(src_str, m.start()),
                             "keyword '%s' on a card is not registered" % kw)

    # -- 5. methods the implementation does not define -----------------------
    def check_methods(self, path, src):
        pat = re.compile(r"(?<![A-Za-z0-9_$.])(" + IDENT + r"(?:\.(?:e|engine|run))?)"
                         r"\.(" + IDENT + r")\s*\(")
        for m in pat.finditer(src):
            recv, meth = m.group(1), m.group(2)
            name, surface = self.surface_for(path, recv)
            if not surface:
                continue
            self.sites += 1
            if meth in surface or meth in OPTIONAL_METHODS:
                continue
            if meth in self.s.engine and name != "engine":
                continue          # reached through ctx.e — checked as engine
            if guarded(src, m.start(), recv, meth):
                continue          # explicit `if (c.foo)` fallback — allowed
            self.add("UNKNOWN-METHOD", path, line_of(src, m.start()),
                     "%s.%s() — not on the %s surface" % (recv, meth, name))

    # -- 6. fields read off a combat event that it never carries -------------
    def check_event_fields(self, path, src):
        for m in re.finditer(r"\.on\??\.?\s*\(\s*'([a-z:]+)'\s*,\s*(?:async\s*)?\(?\s*("
                             + IDENT + r")?\s*\)?\s*=>", src):
            ename, param = m.group(1), m.group(2)
            known = self.s.event_fields.get(ename)
            if not known or not param:
                continue
            body_start = src.find("=>", m.start()) + 2
            rest = src[body_start:body_start + 600]
            brace = rest.find("{")
            body = rest[brace:match_brace(rest, brace)] if 0 <= brace < 4 else rest.split(";")[0]
            for f in set(re.findall(r"\b" + param + r"\.(" + IDENT + r")", body)):
                self.sites += 1
                if f in known:
                    continue
                self.add("UNKNOWN-EVENT-FIELD", path, line_of(src, m.start()),
                         "on('%s', %s => … %s.%s) — the event never carries `%s` "
                         "(carries: %s)" % (ename, param, param, f, f,
                                            ", ".join(sorted(known))))

    # -- 7. statuses that are applied but can never do anything --------------
    def check_inert(self, path, src_str):
        if not rel(path).startswith("game/src/data/"):
            return
        for m in re.finditer(r"\b(?:applyStatus|applySelf|apply|buff|debuff)\s*\(", src_str):
            args, _ = call_args(src_str, src_str.index("(", m.end() - 1))
            for a, pos in args:
                lit = re.fullmatch(r"\s*'([a-z][a-z0-9-]*)'\s*", a)
                if not lit:
                    continue
                sid = lit.group(1)
                d = self.s.status_defs.get(sid)
                if not d or d["hooks"] or d["pipeline"] or d["resource"]:
                    continue
                self.sites += 1
                if sid in self.readers:
                    continue
                self.add("INERT-STATUS", path, line_of(src_str, pos),
                         "status '%s' has no hook, no pipeline slot and no reader — "
                         "applying it is a no-op with a tooltip" % sid)

    # -- 6. a screen writing shared state instead of sending an input --------
    SCREEN_DIRS = ("game/src/scenes/", "game/src/ui/")

    def check_shared_writes(self, path, src):
        """A screen assigning to a `Run` field.

        Every client simulates the WHOLE expedition, so nothing a screen does to
        the Run is private — that is the argument `net/actions.js` opens with.
        An assignment is the one shape that seam cannot see: `act()` is a call,
        so a missing verb is loud, while `run.currentNodeId = id` is silent, has
        no verb to be missing, and is invisible to every other check in this
        file. The map screen wrote `currentNodeId` and `pathIds` by hand for
        months and reached the run layer down a bus name instead of an input.

        The receiver is `run`, anything ending `.run` (`this.run`, `ctx.run`,
        `m.run`), or a local alias assigned from one (`const r = this.run`) —
        rest.js and reward.js both use that alias, and a checker that missed it
        would be checking the interesting files against nothing.
        """
        if not rel(path).startswith(self.SCREEN_DIRS):
            return
        if getattr(self, "_surface_reported", False):
            return
        if len(self.s.run_fields) < 20 and not getattr(self, "_surface_reported", False):
            # `run_fields()` reads the constructor out of state/run.js, and the
            # first version of it indexed to `constructor(cfg = {})`'s DEFAULT
            # ARGUMENT and came back with an empty set — passing this whole
            # check against nothing at all. The Run has ~39 fields; a surface
            # that has collapsed is a failure of the checker, reported here
            # rather than swallowed.
            self.add("SHARED-WRITE", path, 1,
                     "run_fields() returned only %d names — the extractor has "
                     "come loose from state/run.js and this check is looking at "
                     "an empty surface" % len(self.s.run_fields))
            self._surface_reported = True        # report it once, not per file
            return
        aliases = {"run"} | set(re.findall(
            r"(?:const|let|var)\s+(" + IDENT + r")\s*=\s*(?:[\w$.]+\.)?run\b", src))
        pat = re.compile(r"((?:" + IDENT + r"\.)*" + IDENT + r")\.(" + IDENT
                         + r")\s*(?:=[^=>]|\+=|-=)")
        for m in pat.finditer(src):
            recv, fld = m.group(1), m.group(2)
            # Counted BEFORE the filters, so the printed total is evidence this
            # looked at something. A gate whose site count only moves when it
            # finds a problem reports zero sites and zero problems on a tree it
            # never opened, and reads exactly like a clean one (CONTRACTS 5c).
            self.sites += 1
            if fld not in self.s.run_fields:
                continue
            if recv.rpartition(".")[2] not in aliases:
                continue
            self.add("SHARED-WRITE", path, line_of(src, m.start()),
                     "`%s.%s = …` writes shared run state from a screen. Every "
                     "client simulates the whole expedition, so this change "
                     "exists on one machine only — send an input through "
                     "net/actions.js instead" % (recv, fld))

    def _collect_readers(self):
        """Status ids something actually queries (`count('x')`, `stacks(…, 'x')`,
        `hasStatus('x')`, engine-side `status('x')`)."""
        self.readers = set()
        # `onHook(evt, statusId, fn)` IS a reader: U.fire only calls a handler
        # when `stacks(c, c.self, h.statusId) > 0`, so the status id gates the
        # whole Power. Without this, a status whose only consumer is an onHook
        # gate reads as inert — which it is not.
        pat = re.compile(r"\b(?:count|stacks|has|hasStatus|status|res|spendRes|removeStatus"
                         r"|statusMeta|addRes|setRes|onHook)\s*\(([^)]*)\)")
        for p in js_files():
            s = strip_comments_keep_strings(read(p))
            for m in pat.finditer(s):
                self.readers |= set(re.findall(r"'([a-z][a-z0-9-]*)'", m.group(1)))
            # the engine special-cases a few ids by name (`id === 'smothered'`)
            if rel(p).startswith("game/src/combat/"):
                self.readers |= set(re.findall(r"===?\s*'([a-z][a-z0-9-]*)'", s))

    def run_all(self):
        self._collect_readers()
        for path in js_files():
            raw = read(path)
            code = strip_comments(raw)             # no strings, no comments
            lit = strip_comments_keep_strings(raw)  # strings kept
            self.check_optional_calls(path, code)
            self.check_option_keys(path, code)
            self.check_sfx(path, lit)
            self.check_ids(path, lit)
            self.check_methods(path, code)
            self.check_event_fields(path, lit)
            self.check_inert(path, lit)
            self.check_shared_writes(path, code)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--json")
    ap.add_argument("--kind", help="only report this kind")
    a = ap.parse_args()

    surf = Surfaces()
    surf.run_fields = run_fields()
    ck = Checker(surf)
    ck.run_all()

    probs = ck.problems
    if a.kind:
        probs = [p for p in probs if p["kind"] == a.kind]

    by_kind = {}
    for p in probs:
        by_kind.setdefault(p["kind"], []).append(p)

    for kind in sorted(by_kind):
        rows = by_kind[kind]
        print("\n── %s (%d)" % (kind, len(rows)))
        shown = rows if a.verbose else rows[:60]
        for p in shown:
            print("   %s:%d  %s" % (p["file"], p["line"], p["msg"]))
        if len(rows) > len(shown):
            print("   … %d more (use --verbose)" % (len(rows) - len(shown)))

    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            json.dump({"sites": ck.sites, "problems": probs}, fh, indent=1)

    print("\nRESULT: %d call sites checked, %d problems" % (ck.sites, len(probs)))
    sys.exit(1 if probs else 0)


if __name__ == "__main__":
    main()
