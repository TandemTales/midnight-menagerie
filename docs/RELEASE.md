# Release checklist (Steam, Windows)

## Done

### One command builds the depot

```bash
python tools/package_release.py            # -> D:/UILOOP/release/MidnightMenagerie-win64/
python tools/package_release.py --smoke    # ...then boot it hidden, in the GPU slot, and check it
python tools/package_release.py --dry-run  # what would ship, nothing copied
```

`--out DIR` changes the parent folder (it must be outside the repo). The
script only ever deletes a folder it made itself (one with
`resources/app/release.json`). Electron and steamworks.js are read from
`shell/node_modules`; from a worktree, the main checkout's.

```
MidnightMenagerie-win64/
  MidnightMenagerie.exe            electron.exe, renamed
  *.dll *.pak *.dat *.bin locales/ Electron's dist/, unchanged (default_app.asar dropped)
  LICENSE.electron.txt  LICENSES.chromium.html  THIRD-PARTY-NOTICES.md
  resources/app/
    main.js preload.js steam.js    the shell
    package.json                   trimmed; productName "Midnight Menagerie"
    release.json                   steamAppId (baked from shell/steam_appid.txt), commit, dirty flag
    THIRD-PARTY-NOTICES.md
    node_modules/steamworks.js/    index.js, package.json, LICENSE, dist/win64/{.node, steam_api64.dll}
    game/                          every TRACKED file in game/, minus four dev files
```

`shell/main.js` serves `resources/app` when `resources/app/game/index.html`
exists, else the repo as before; port 8790 either way.

### What is left out of game/, and why each is unused

The game comes from `git ls-files game`, so untracked files never ship (the
60 MB `game/assets/Portrait Paintings/` source PNGs in the main checkout are
not in git). Of the 2686 tracked files, 4 are dropped:

| File | Proof it is unused |
|---|---|
| `game/src/audio/analyze.py`, `game/src/audio/generate_narration.py`, `game/src/ui/make_thumbs.py` | Python; a browser cannot run them. They write assets at dev time. |
| `game/src/audio/analysis.json` | `analyze.py`'s output. No `.js`/`.css`/`.html`/`.json` in game/ contains `analysis.json` or imports it; the packager re-checks this on every build. |

Every other file's name appears in the game's source or manifests (a scan of
all 2686), or under a directory the source builds paths into (`portraits/`,
`blueprint/`, `kids/`, `hero/`, `ui/kit/`, `ui/objects/`). Kept although
nothing imports it: `game/vendor/jsm/shaders/FXAAShader.js` (10 KB, part of
the vendored three.js addons the licence gate counts).

The packager fails the build if any notice is missing (`game/vendor/LICENSE`,
`game/assets/fonts/OFL.txt`, `THIRD-PARTY-NOTICES.md`, Electron's and
steamworks.js's licences), or if anything from `art/ UI/ rooms/ animations/
audio/ tests/ tools/ docs/ shots/`, a `.docx`, any other `.md`, or a
`steam_appid.txt` is in the package.

### The App ID

`steam_appid.txt` does not ship: Steam supplies the id when it launches the
depot. The packager reads `shell/steam_appid.txt` and bakes it into
`release.json`; `steamworks.js`'s `init(id)` takes it from there. Empty
packages and runs (no Steam, the game plays). `480` is refused.

### Size (2026-10-23, commit 4a109fd6)

| | |
|---|---|
| Package | **783.5 MiB** (821.5 MB), 2766 files |
| Electron runtime | 367.0 MiB: `MidnightMenagerie.exe` 234 MiB, `locales/` 48 MiB, `dxcompiler.dll` 24.5 MiB, `LICENSES.chromium.html` 19.6 MiB |
| `resources/app/game` | 414.5 MiB: sprites 264 MiB, audio 58, cards 38, portraits 20, ui 14, src 10 |
| steamworks.js | 2.0 MiB |

The repo's `game/` is 474 MiB; the difference is the untracked Portrait
Paintings (60 MiB) and the four dev files. `locales/` could drop to `en-US`
only (-47 MiB), but that can change `navigator.language` and `Intl` defaults,
so it is not done.

### Smoke

`MidnightMenagerie.exe --smoke` printed `SMOKE {"ok":true,"scene":"title",
... "steam":false,"errors":[]}` and the screenshot shows the title drawn. The
smoke window is hidden and runs at ~2 frames a second, so a shot 4 s after the
title is mid-entrance (dark sky, lamp halos only); `--smoke` in the packager
waits 12 s longer.

### Upload with SteamPipe

Samples in `shell/steampipe/`: `app_build_APPID.vdf` and
`depot_build_DEPOTID.vdf`. Rename them and replace the placeholders, then:

```
steamcmd +login <account> +run_app_build "<repo>\shell\steampipe\app_build_<appid>.vdf" +quit
```

On the partner site: launch option **Executable `MidnightMenagerie.exe`**,
OS Windows, 64-bit; set the build live by hand (`SetLive` is empty).

## Owned by Josh

1. **App ID** into `shell/steam_appid.txt` (never 480), then re-package.
   Depot id(s) into the two `.vdf` files.
2. **Copyright holder**: replace "the Midnight Menagerie authors" in
   `THIRD-PARTY-NOTICES.md` (game section) with the legal name or entity.
3. **Credits**: human names in `game/src/scenes/title.js` (the
   "Design, code & writing" line).
4. **Achievements**: register these 32 API names on the partner site (all are
   `shippable()` today; name = `ACH_` + id upper-cased). No stats are used.
   `ACH_FIRST_SCUFFLE ACH_FIRST_WING ACH_FIRST_WIN ACH_FIRST_LOSS
   ACH_FIRST_RESCUE ACH_RESCUE_FOUR ACH_RESCUE_ALL ACH_PLAYED_EIGHT
   ACH_PLAYED_ALL ACH_BEAT_BUTLER ACH_BEAT_GOVERNESS ACH_BEAT_BEDFRAME
   ACH_REACH_HEART ACH_HAUNT_1 ACH_HAUNT_3 ACH_HAUNT_5 ACH_BIG_DECK
   ACH_LEAN_DECK ACH_TEN_UPGRADES ACH_CURSED (hidden) ACH_FIRST_KEEPSAKE
   ACH_EIGHT_KEEPSAKES ACH_FORGED ACH_UNTOUCHED_BOSS ACH_BIG_TURN
   ACH_LAST_BREATH (hidden) ACH_COOP_FIRST ACH_COOP_FOUR ACH_COOP_WIN
   ACH_TEN_RUNS ACH_FIFTY_RUNS ACH_CLUE_HUNTER`. Display names and
   descriptions: `ACHIEVEMENTS` in `game/src/core/achievements.js`.
5. **Store page**, including the AI-content disclosure (`docs/COMMERCIAL-USE.md`).
6. **Steam Deck verification**: the Deck runs this Windows build under
   Proton. A native build needs a Linux Electron dist
   (`--platform linux64 --electron-dist ...`, written, never run).

## Not done (known gaps, none blocks a first upload)

* The exe still carries Electron's icon and version strings (Task Manager says
  "Electron"); changing them needs `rcedit` at package time.
* The shell supplies no `storage` to the game, so saves are `localStorage` in
  `%APPDATA%\Midnight Menagerie\` and there is no Steam Cloud yet
  (`docs/STEAM-DECK.md`). The repo shell's saves live under
  `midnight-menagerie-shell\`, a different folder.
* The Steam overlay is not enabled (`steamworks.js`'s
  `electronEnableSteamOverlay` is not called), and `restartAppIfNecessary` is
  not called, so the exe launched outside Steam runs without Steam.
