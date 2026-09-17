#!/usr/bin/env python3
"""No shader source contains a character that ends its own template literal.
OWNER: atmosphere.

    python tests/shader-literals/check.py [--root game/src] [--verbose]

A gate against a bug class that cost four debugging cycles in one afternoon.

WHY THIS EXISTS
---------------
Every shader in this project is a JS template literal:

    export const WALL_FRAG = /* glsl */`
      precision highp float;
      ...
    `;

A BACKTICK anywhere inside that literal ends it. The rest of the GLSL is then
parsed as JavaScript, and what you get is a page error like

    PAGEERROR Unexpected identifier 'cellv'

which names a GLSL local, points at no line, and looks nothing like a syntax
error in a comment. The game does not boot; `tools/shot.py` writes a black
frame and prints `state: no MM`, and a 0-byte `.console.txt` beside it.

It is easy to do, because this codebase's comment style quotes identifiers in
backticks -- every .md, every .py and every non-shader .js file does -- and a
GLSL comment is the one place that convention is a syntax error. It happened
three times in one session while the backdrop's ink lines were being written,
each time in a comment that had been copied from a commit message.

The same trap closes over ${...}: inside a template literal that is an
interpolation, so a GLSL comment mentioning a shader's own ${GLSL_LIB} splice,
or any `${` at all that the author did not mean as one, either fails to compile
or silently pastes something in.

And a splice of a name the FILE DOES NOT HAVE is the same class of failure with
a different message. `${NOISE}` in shaders/backdrop.js, which imports only
GLSL_LIB, threw "PAGEERROR NOISE is not defined" at module load and took the
whole game down -- seven black captures before anyone read the state file. So
every splice is checked against what the file actually declares or imports, not
against a list kept here (CONTRACTS trap 60: a hand-kept list of what exists
goes stale).

WHAT IT CHECKS
--------------
For every `/* glsl */` template literal in the tree: no backtick inside it, and
every `${NAME}` a name the file imports or declares. Reports file and line.

This is a static check: no browser, no server, about 40 ms.
"""
import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MARK = "/* glsl */`"
IMPORT = re.compile(
    r"^\s*(?:import\s*\{([^}]*)\}|(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=)",
    re.MULTILINE)


def literals(src):
    """Yield (start_index, body) for every /* glsl */` ... ` literal.

    The end is found by scanning for an UNESCAPED backtick, which is also what
    the JS parser does -- so the first backtick this finds is exactly the one
    that ends the literal for the engine, and anything the author meant to be
    inside it after that point is the bug.
    """
    i = 0
    while True:
        j = src.find(MARK, i)
        if j < 0:
            return
        k = j + len(MARK)
        e = k
        while e < len(src):
            if src[e] == "\\":
                e += 2
                continue
            if src[e] == "`":
                break
            e += 1
        yield k, src[k:e], e
        i = e + 1


def comment_faults(rel, src, start, body):
    """An unterminated /* in the GLSL, which is the SILENT fault.

    Round 8's BISTRE lost a capture cycle to this and it is the worst failure
    mode in this file, because nothing looks wrong. Every backtick trap above
    breaks the PAGE, so `shot.py` writes a black frame and says `state: no MM`.
    A broken GLSL comment does not: the module parses, the page renders, the
    room draws with the last program that linked, and the numbers off that
    capture look entirely plausible.

    GLSL has NO nested comments (GLSL ES 3.00 s3.4), and that cuts both ways:

      an unterminated /*   swallows the rest of the shader, usually including
                           main(), and the program fails to link. This is the
                           fault.
      a /* inside a /*     is NOT a fault, it is just text, and the first */
                           ends the comment. The first version of this check
                           called it an error and immediately fired on
                           `a prop in UI/*.png reads 0.19-0.43` -- a path, in a
                           comment, whose `/` and `*` are adjacent. Do not
                           reinstate it.
      a stray */           outside any comment IS a syntax error.

    A `//` line comment hides both, so those lines are skipped.
    """
    out, i, n = [], 0, len(body)
    nl = chr(10)
    while i < n - 1:
        two = body[i:i + 2]
        if two == "//":
            j = body.find(nl, i)
            i = n if j < 0 else j + 1
            continue
        if two == "/*":
            j = body.find("*/", i + 2)
            if j < 0:
                out.append("%s:%d  an unterminated /* in the GLSL: it swallows "
                           "the rest of the shader and the program will not "
                           "link, but the PAGE still renders and the capture "
                           "looks plausible"
                           % (rel, line_of(src, start + i)))
                break
            i = j + 2
            continue
        if two == "*/":
            out.append("%s:%d  a */ in the GLSL that closes no comment"
                       % (rel, line_of(src, start + i)))
            i += 2
            continue
        i += 1
    return out


def line_of(src, idx):
    return src.count("\n", 0, idx) + 1


def check(root, verbose=False):
    problems = []
    files = 0
    lits = 0
    for dirpath, _, names in os.walk(root):
        for n in sorted(names):
            if not n.endswith(".js"):
                continue
            path = os.path.join(dirpath, n)
            src = open(path, encoding="utf-8").read()
            if MARK not in src:
                continue
            files += 1
            rel = os.path.relpath(path, ROOT).replace("\\", "/")
            # What this file can splice: every imported binding, plus every
            # top-level const it declares itself.
            have = set()
            for m in IMPORT.finditer(src):
                if m.group(1):
                    for name in m.group(1).split(","):
                        name = name.strip().split(" as ")[-1].strip()
                        if name:
                            have.add(name)
                elif m.group(2):
                    have.add(m.group(2))
            for start, body, end in literals(src):
                lits += 1
                # Whatever follows the literal's real end, on the same line, is
                # the give-away: a well-formed shader ends with `;` or `}`;.
                tail = src[end + 1:end + 3]
                if tail.strip()[:1] not in (";", ",", ")"):
                    problems.append("%s:%d  literal ends mid-shader (a backtick "
                                    "inside it closed it early)"
                                    % (rel, line_of(src, end)))
                for m in re.finditer(r"\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}", body):
                    if m.group(1) not in have:
                        problems.append("%s:%d  ${%s} is spliced but this file "
                                        "neither imports nor declares it"
                                        % (rel, line_of(src, start + m.start()),
                                           m.group(1)))
                for m in re.finditer(r"\$\{(?![\s]*[A-Za-z_])", body):
                    problems.append("%s:%d  a bare ${ inside a shader literal"
                                    % (rel, line_of(src, start + m.start())))
                problems.extend(comment_faults(rel, src, start, body))
            if verbose:
                print("  scanned", rel)
    return files, lits, problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.join(ROOT, "game", "src"))
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()
    files, lits, problems = check(a.root, a.verbose)
    print("shader literals: %d files, %d literals, %d problems"
          % (files, lits, len(problems)))
    for p in problems:
        print("  FAIL", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
