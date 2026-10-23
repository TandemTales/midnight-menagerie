#!/usr/bin/env python3
"""Assemble the Steam depot: one folder that IS the game, from one command.

    python tools/package_release.py                    # -> D:/UILOOP/release/MidnightMenagerie-win64
    python tools/package_release.py --out D:/somewhere # the parent of MidnightMenagerie-win64
    python tools/package_release.py --smoke            # ...then boot it hidden and check the title
    python tools/package_release.py --dry-run          # list what would ship, copy nothing

WHAT SHIPS
----------
    MidnightMenagerie-win64/
      MidnightMenagerie.exe          electron.exe, renamed
      *.dll *.pak *.dat *.bin ...    the rest of Electron's dist/, unchanged
      LICENSE.electron.txt           Electron's MIT licence (dist/LICENSE)
      LICENSES.chromium.html         Chromium and everything it bundles
      THIRD-PARTY-NOTICES.md         the index of what we did not make
      resources/app/
        main.js preload.js steam.js  the shell (shell/*.js, tracked)
        package.json                 trimmed: name, productName, version, main
        release.json                 the Steam App ID baked from shell/steam_appid.txt + the commit
        THIRD-PARTY-NOTICES.md
        node_modules/steamworks.js/  index.js, package.json, LICENSE, dist/<platform>/ runtime only
        game/                        every TRACKED file under game/ except the dev-only ones below

Electron's `resources/default_app.asar` is dropped, so the exe can only ever
run `resources/app`.

Game files come from `git ls-files game` read from the working tree, so an
untracked folder someone dropped into game/assets (60 MB of source paintings
sat there on 2026-10-23) can never reach a player. A tracked game/ file with
uncommitted edits is shipped as it is on disk, and release.json says dirty.

WHAT DOES NOT SHIP FROM game/ (each one proven unused, see docs/RELEASE.md)
    game/**/*.py                     dev scripts that wrote assets (analyze.py, generate_narration.py, make_thumbs.py)
    game/**/*.md                     none today; design notes never ship
    game/src/audio/analysis.json     analyze.py's output; no module fetches or imports it

and after copying, the package is checked: the notices are present, nothing
from art/ UI/ rooms/ animations/ audio/ tests/ tools/ docs/ shots/, no .docx,
no .md but the notices index, no steam_appid.txt, and no packaged source file
names an excluded data file. Any failure exits 1.

THE APP ID
    shell/steam_appid.txt is read here and written into release.json as
    `steamAppId`; main.js prefers release.json when it exists. Empty is fine:
    the build packages and plays, without Steam. 480 (Spacewar) is refused.

The Electron runtime and steamworks.js are read from shell/node_modules. A
worktree has none, so the main checkout's is used (found via git's common dir).
`--electron-dist` / `--node-modules` override either.

--platform linux64 needs a LINUX Electron dist (--electron-dist); only the
win64 one is installed here, so linux64 is written but has never been run.
"""
import argparse
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

REPO = pathlib.Path(__file__).resolve().parent.parent
NAME = "MidnightMenagerie"
PRODUCT = "Midnight Menagerie"

PLATFORMS = {
    "win64": {
        "exe_from": "electron.exe", "exe_to": f"{NAME}.exe",
        "steamworks": ["dist/win64/steamworksjs.win32-x64-msvc.node", "dist/win64/steam_api64.dll"],
    },
    "linux64": {
        "exe_from": "electron", "exe_to": NAME,
        "steamworks": ["dist/linux64/steamworksjs.linux-x64-gnu.node", "dist/linux64/libsteam_api.so"],
    },
}
STEAMWORKS_COMMON = ["index.js", "package.json", "LICENSE"]

# Dev-only files inside game/. Each has a line in docs/RELEASE.md saying why it is unused.
EXCLUDE_EXT = {".py", ".md"}
EXCLUDE_FILES = {"game/src/audio/analysis.json"}

MUST_SHIP = ["game/index.html", "game/vendor/LICENSE", "game/assets/fonts/OFL.txt", "THIRD-PARTY-NOTICES.md"]
NEVER_TOP = {"art", "UI", "rooms", "animations", "audio", "tests", "tools", "docs", "shots"}


def git(*args, cwd=REPO):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, check=True).stdout


def main_checkout():
    """The main worktree: where shell/node_modules was installed."""
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir").decode().strip()
    return pathlib.Path(common).parent


def default_out():
    d = pathlib.Path("D:/UILOOP/release")
    return d if d.drive and pathlib.Path(d.drive + "/").exists() else pathlib.Path.home() / "MidnightMenagerie-release"


def read_app_id():
    p = REPO / "shell" / "steam_appid.txt"
    raw = p.read_text(encoding="utf-8").strip() if p.exists() else ""
    if not raw:
        return 0
    if not raw.isdigit():
        sys.exit(f"shell/steam_appid.txt is not a number: {raw!r}")
    n = int(raw)
    if n == 480:
        sys.exit("shell/steam_appid.txt is 480 (Spacewar). Never ship that; put the real App ID in, or leave it empty.")
    return n


def game_files():
    raw = git("ls-files", "-z", "--", "game")
    keep, dropped = [], []
    for rel in sorted(x for x in raw.decode("utf-8").split("\0") if x):
        if not (REPO / rel).is_file():          # deleted in the working tree
            continue
        if pathlib.PurePosixPath(rel).suffix.lower() in EXCLUDE_EXT or rel in EXCLUDE_FILES:
            dropped.append(rel)
        else:
            keep.append(rel)
    return keep, dropped


def shell_files():
    raw = git("ls-files", "-z", "--", "shell")
    return sorted(x for x in raw.decode("utf-8").split("\0")
                  if x and x.count("/") == 1 and x.endswith(".js"))


def copy(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def size_of(p):
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


def check(out, app, dropped):
    problems = []
    for rel in MUST_SHIP:
        if not (app / rel).is_file():
            problems.append(f"missing notice/entry file: resources/app/{rel}")
    for rel in ["THIRD-PARTY-NOTICES.md", "LICENSE.electron.txt", "LICENSES.chromium.html",
                "resources/app/node_modules/steamworks.js/LICENSE"]:
        if not (out / rel).is_file():
            problems.append(f"missing notice: {rel}")
    if (out / "resources" / "default_app.asar").exists():
        problems.append("Electron's default_app.asar is still in resources/")
    for f in out.rglob("*"):
        if not f.is_file():
            continue
        rel = f.relative_to(out).as_posix()
        arel = f.relative_to(app).as_posix() if app in f.parents else None
        if arel and arel.split("/", 1)[0] in NEVER_TOP:
            problems.append(f"dev folder shipped: {rel}")
        if f.suffix.lower() == ".docx":
            problems.append(f".docx shipped: {rel}")
        if f.suffix.lower() == ".md" and f.name != "THIRD-PARTY-NOTICES.md":
            problems.append(f".md shipped: {rel}")
        if f.name.lower() == "steam_appid.txt":
            problems.append(f"steam_appid.txt shipped: {rel} (Steam supplies the id)")
    # An excluded DATA file (not a script) must not be named by anything that ships.
    names = {pathlib.PurePosixPath(d).name for d in dropped
             if pathlib.PurePosixPath(d).suffix.lower() not in EXCLUDE_EXT}
    if names:
        for f in (app / "game").rglob("*"):
            if f.suffix.lower() in {".js", ".mjs", ".css", ".html", ".json"}:
                text = f.read_text(encoding="utf-8", errors="replace")
                for n in names:
                    if n in text:
                        problems.append(f"{f.relative_to(app).as_posix()} names excluded file {n}")
    return problems


def report(out, app):
    total = size_of(out)
    print(f"\npackage: {out}  {total / 1e6:.1f} MB in {sum(1 for f in out.rglob('*') if f.is_file())} files")
    parts = {}
    for f in out.iterdir():
        if f.name == "resources":
            continue
        key = f.name if f.is_dir() or f.stat().st_size > 5e6 else "(electron: other files)"
        parts[key] = parts.get(key, 0) + (size_of(f) if f.is_dir() else f.stat().st_size)
    for f in app.iterdir():
        if f.name == "game":
            continue
        parts[f"resources/app/{f.name}"] = size_of(f) if f.is_dir() else f.stat().st_size
    assets = app / "game" / "assets"
    for f in assets.iterdir():
        parts[f"game/assets/{f.name}"] = size_of(f) if f.is_dir() else f.stat().st_size
    for f in (app / "game").iterdir():
        if f.name != "assets":
            parts[f"game/{f.name}"] = size_of(f) if f.is_dir() else f.stat().st_size
    for k, v in sorted(parts.items(), key=lambda kv: -kv[1])[:14]:
        print(f"  {v / 1e6:8.1f} MB  {k}")
    return total


def smoke(out, plat):
    sys.path.insert(0, str(REPO / "tools"))
    from gpu_slot import gpu_slot
    exe = out / PLATFORMS[plat]["exe_to"]
    shot = out.parent / "smoke.png"
    # The smoke window is hidden, so Chromium runs it at ~2 frames a second:
    # 4 s after the title is up its 1 s entrance has not finished and the shot
    # is a dark sky with four lamp halos (measured 2026-10-23). A no-op
    # --smoke-js buys main.js's 12 s of waits before the shot; then it is drawn.
    wait = out.parent / "smoke-wait.js"
    wait.write_text("void 0;\n", encoding="utf-8")
    with gpu_slot("package smoke"):
        r = subprocess.run([str(exe), "--smoke", f"--smoke-js={wait}", f"--smoke-shot={shot}"], cwd=str(out),
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    line = next((l for l in r.stdout.splitlines() if l.startswith("SMOKE ")), None)
    print("\n" + (r.stderr.strip() + "\n" if r.stderr.strip() else "") + (line or "no SMOKE line"))
    if not line:
        return False
    s = json.loads(line[6:])
    ok = s.get("ok") is True and not s.get("errors")
    print(f"smoke {'OK' if ok else 'FAILED'} (exit {r.returncode}); screenshot {shot}")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", type=pathlib.Path, default=default_out(), help="parent folder of the package")
    ap.add_argument("--platform", choices=sorted(PLATFORMS), default="win64")
    ap.add_argument("--electron-dist", type=pathlib.Path, help="Electron's dist/ (default: shell/node_modules/electron/dist)")
    ap.add_argument("--node-modules", type=pathlib.Path, help="where steamworks.js is installed (default: shell/node_modules)")
    ap.add_argument("--dry-run", action="store_true", help="list what would ship and exit")
    ap.add_argument("--smoke", action="store_true", help="boot the packaged exe hidden (in the GPU slot) and check it")
    a = ap.parse_args()

    plat = PLATFORMS[a.platform]
    nm = a.node_modules
    if nm is None:
        nm = REPO / "shell" / "node_modules"
        if not nm.is_dir():
            nm = main_checkout() / "shell" / "node_modules"
    dist = a.electron_dist or nm / "electron" / "dist"
    sw = nm / "steamworks.js"
    for need in [dist / plat["exe_from"], *(sw / f for f in STEAMWORKS_COMMON + plat["steamworks"])]:
        if not need.is_file():
            sys.exit(f"not found: {need}  (is shell/node_modules installed? --electron-dist / --node-modules)")

    app_id = read_app_id()
    keep, dropped = game_files()
    shell_js = shell_files()
    print(f"game/: {len(keep)} files ship, {len(dropped)} dev-only left out:")
    for d in dropped:
        print(f"  - {d}")
    print(f"shell: {', '.join(shell_js)}   App ID: {app_id or '(empty: no Steam)'}")
    if a.dry_run:
        return 0

    out = (a.out / f"{NAME}-{a.platform}").resolve()
    if REPO.resolve() in out.parents or out == REPO.resolve():
        sys.exit(f"--out must be outside the repo: {out}")
    if out.exists():
        # Only ever delete a folder this script made.
        if not (out / "resources" / "app" / "release.json").is_file():
            sys.exit(f"{out} exists and is not a package this script made; refusing to delete it")
        shutil.rmtree(out)
    t0 = time.time()

    # 1. Electron, minus its default app, exe renamed.
    shutil.copytree(dist, out, ignore=shutil.ignore_patterns("default_app.asar"))
    (out / plat["exe_from"]).rename(out / plat["exe_to"])
    if (out / "LICENSE").is_file():
        (out / "LICENSE").rename(out / "LICENSE.electron.txt")

    # 2. The app.
    app = out / "resources" / "app"
    app.mkdir(parents=True, exist_ok=True)
    for rel in shell_js:
        copy(REPO / rel, app / pathlib.PurePosixPath(rel).name)
    src_pkg = json.loads((REPO / "shell" / "package.json").read_text(encoding="utf-8"))
    pkg = {"name": "midnight-menagerie", "productName": PRODUCT, "version": src_pkg.get("version", "0.0.0"),
           "description": PRODUCT, "private": True, "main": "main.js"}
    (app / "package.json").write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
    head = git("rev-parse", "HEAD").decode().strip()
    dirty = bool(git("status", "--porcelain", "--untracked-files=no", "--", "game", "shell").strip())
    rel_info = {"steamAppId": app_id, "commit": head, "dirty": dirty, "platform": a.platform,
                "electron": (dist / "version").read_text().strip() if (dist / "version").is_file() else "",
                "built": time.strftime("%Y-%m-%dT%H:%M:%S")}
    (app / "release.json").write_text(json.dumps(rel_info, indent=2) + "\n", encoding="utf-8")
    for f in STEAMWORKS_COMMON + plat["steamworks"]:
        copy(sw / f, app / "node_modules" / "steamworks.js" / f)
    for rel in keep:
        copy(REPO / rel, app / rel)
    copy(REPO / "THIRD-PARTY-NOTICES.md", app / "THIRD-PARTY-NOTICES.md")
    copy(REPO / "THIRD-PARTY-NOTICES.md", out / "THIRD-PARTY-NOTICES.md")
    print(f"copied in {time.time() - t0:.0f} s; commit {head[:8]}{' (dirty)' if dirty else ''}")

    problems = check(out, app, dropped)
    report(out, app)
    for p in problems:
        print(f"  PROBLEM  {p}")
    if problems:
        print(f"\nPACKAGE FAILED: {len(problems)} problem(s)")
        return 1
    print("\nPACKAGE OK")
    if a.smoke and not smoke(out, a.platform):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
