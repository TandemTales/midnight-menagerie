"""Restore every file's own line endings after an edit, then prove it.

    python endings_guard.py --base <commit>        # run inside the repo or worktree

Midnight Menagerie is 55 CRLF files, 155 LF files and 6 MIXED ones, and the
editing tools normalise a mixed file to one ending on write -- a 3-line change
to combat.css came back as an 18-line diff that way. This makes the endings
mechanical instead of a thing to remember:

  * every line whose CONTENT is unchanged from <base> gets <base>'s ending back
  * every new or changed line gets the ending most of <base>'s lines use
  * a file that is new since <base> is left exactly as written

Then it compares `git diff --numstat <base>` with the same diff ignoring CR at
EOL and prints ENDINGS OK only when they agree for every file.
"""
import argparse
import difflib
import subprocess
import sys


def git(*args, check=True):
    return subprocess.run(["git", *args], capture_output=True, check=check).stdout


def split_keep(raw):
    """Lines with their terminator: (content_without_eol, eol)."""
    out, i, n = [], 0, len(raw)
    while i < n:
        j = raw.find(b"\n", i)
        if j < 0:
            out.append((raw[i:], b""))
            break
        if j > i and raw[j - 1:j] == b"\r":
            out.append((raw[i:j - 1], b"\r\n"))
        else:
            out.append((raw[i:j], b"\n"))
        i = j + 1
    return out


def repair(path, base):
    try:
        old = git("show", "%s:%s" % (base, path))
    except subprocess.CalledProcessError:
        return False            # new since base: leave it as written
    try:
        cur = open(path, "rb").read()
    except FileNotFoundError:
        return False            # deleted
    a, b = split_keep(old), split_keep(cur)
    crlf = sum(1 for _, e in a if e == b"\r\n")
    lf = sum(1 for _, e in a if e == b"\n")
    dominant = b"\r\n" if crlf >= lf else b"\n"
    sm = difflib.SequenceMatcher(None, [c for c, _ in a], [c for c, _ in b], autojunk=False)
    fixed = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(j2 - j1):
                content, eol = b[j1 + k]
                want = a[i1 + k][1]
                fixed.append(content + (want if eol else b""))
        elif tag in ("replace", "insert"):
            for content, eol in b[j1:j2]:
                fixed.append(content + (dominant if eol else b""))
    new = b"".join(fixed)
    if new != cur:
        open(path, "wb").write(new)
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    a = ap.parse_args()
    names = [n for n in git("diff", "--name-only", a.base).decode().splitlines() if n]
    text = [n for n in names if n.endswith((".js", ".css", ".html", ".py", ".json", ".md", ".txt", ".svg"))]
    changed = [n for n in text if repair(n, a.base)]
    for n in changed:
        print("  restored endings:", n)
    plain = git("diff", "--numstat", a.base, "--", *text).decode().splitlines() if text else []
    icr = git("diff", "--numstat", "--ignore-cr-at-eol", a.base, "--", *text).decode().splitlines() if text else []
    if sorted(plain) != sorted(icr):
        print("ENDINGS DIFFER")
        for x, y in zip(sorted(plain), sorted(icr)):
            if x != y:
                print("  %s   vs ignoring CR: %s" % (x, y))
        return 1
    print("ENDINGS OK (%d text files differ from %s, %d repaired)" % (len(text), a.base[:8], len(changed)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
