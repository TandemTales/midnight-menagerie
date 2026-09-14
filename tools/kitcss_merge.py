"""Resolve game/src/ui/kit.css for a UI-pass merge: 3-way merge the body, join the tails.

    git merge --no-ff --no-commit ui/r5-combat-b        # kit.css conflicts at its end
    python tools/kitcss_merge.py <round base> ui/r5-combat-b
    git add game/src/ui/kit.css                         # then check, then commit

Written for round 4's merges, where every track appended to kit.css.

Every track appends its new components after the base's last line, so git sees
two appends at the same spot and conflicts, aligning the sections' shared
opener and closing brace. Splitting at the base's own last lines avoids that:

  body = the file up to and including the base's final K lines
  tail = everything after them (the track's appended sections)

The bodies go through `git merge-file` (a real 3-way merge, so mid-file edits
in different places both land); the result is merged body + ours tail + theirs
tail. Exits 1 if the body merge conflicts or the base's end is not found.

Check the result before `git add`: the resolved file's changes against HEAD
should equal theirs's changes against the base (difflib over both), and no
conflict marker may remain. Laying ONE screen's pieces from a losing branch
(an EXPAND merge) is hand work: append only the rules that screen uses, and
grep for names two builders both defined (round 4: .kit-lamp, lamp.webp).
"""
import subprocess, sys, tempfile, os

K = 8
PATH = "game/src/ui/kit.css"


def blob(rev):
    return subprocess.run(["git", "show", f"{rev}:{PATH}"], capture_output=True, check=True).stdout.decode("utf-8")


def split(text, base_lines):
    lines = text.split("\n")
    sig = base_lines[-K:]
    for i in range(len(lines) - K, -1, -1):
        if lines[i:i + K] == sig:
            return lines[:i + K], lines[i + K:]
    raise SystemExit(f"base end not found (last {K} lines of base)")


def main():
    base_rev, theirs_rev = sys.argv[1], sys.argv[2]
    ours_rev = sys.argv[sys.argv.index("--ours-rev") + 1] if "--ours-rev" in sys.argv else "HEAD"
    base = blob(base_rev)
    assert base.endswith("\n")
    base_lines = base.split("\n")[:-1]
    ours = blob(ours_rev)
    theirs = blob(theirs_rev)
    ob, ot = split(ours.rstrip("\n"), base_lines)
    tb, tt = split(theirs.rstrip("\n"), base_lines)
    with tempfile.TemporaryDirectory() as d:
        paths = {}
        for name, lines in (("ours", ob), ("base", base_lines), ("theirs", tb)):
            paths[name] = os.path.join(d, name)
            with open(paths[name], "w", encoding="utf-8", newline="") as f:
                f.write("\n".join(lines) + "\n")
        r = subprocess.run(["git", "merge-file", "-p", paths["ours"], paths["base"], paths["theirs"]], capture_output=True)
        body = r.stdout.decode("utf-8")
        if r.returncode != 0:
            print(body[-2000:])
            raise SystemExit(f"body merge conflicted ({r.returncode} conflicts)")
    tail_o = "\n".join(ot).strip("\n")
    tail_t = "\n".join(tt).strip("\n")
    out = body.rstrip("\n") + "\n"
    for tail in (tail_o, tail_t):
        if tail:
            out += "\n" + tail + "\n"
    with open(PATH, "w", encoding="utf-8", newline="") as f:
        f.write(out)
    print(f"kit.css: body {len(body.splitlines())} lines (merged), ours tail {len(ot)} lines, theirs tail {len(tt)} lines -> {len(out.splitlines())} lines; CR {out.count(chr(13))}")


if __name__ == "__main__":
    main()
