# The desktop shell (Steam co-op)

Midnight Menagerie in its own window, with Steam attached, so two to four
players on different computers can play one expedition together.

The browser build is unchanged. The shell serves the same `game/` folder.

## One-time setup (each player)

1. Install [Node.js](https://nodejs.org/) (LTS) and have Steam running and logged in.
2. Clone the repo and check out `dev`.
3. Install the shell's packages:

   ```bash
   cd shell
   npm install
   ```

4. Put the game's Steam **App ID** (just the number) in `shell/steam_appid.txt`.
   It is committed, so once it is in the repo nobody needs to edit it again.
5. Your Steam account must have the app. For an unreleased game that means a
   key from Steamworks (*Users & Permissions → Request Steam Keys*) redeemed in
   Steam, or being a member of the Steamworks partner account.

## Playing together

```bash
cd shell
npm start
```

Then, on the title screen, **Play Together**:

- **Same password:** everyone types the same two words and presses *Climb up*.
  The password is also the map seed, so the same words always draw the same
  house.
- **Or join through Steam:** once the host is in the room, a friend can
  right-click them in the Steam friends list and choose *Join Game*, or the
  host can *Invite to Game*. The friend's game opens straight onto the host's
  room. If the friend's game was not running, Steam launches it first.

Password search only finds lobbies in nearby regions. If the friend is far
away and the password does not find you, use *Join Game* or an invite. Those
always work.

## How it works

| File | Job |
|---|---|
| `main.js` | Serves the repo on `127.0.0.1:8790` (fixed, so the save survives restarts), opens the window, starts Steam. |
| `steam.js` | Everything steamworks.js: one Steam lobby per password, P2P on the Reliable channel, invites, "Join Game" presence. |
| `preload.js` | Installs `window.__MM_HOST__`, the contract in `game/src/platform/index.js`, plus `net` for the lobby. |
| `../game/src/net/transport.js` | `SteamTransport`, the game's side; `scenes/lobby.js` picks it when `net` is present. |

With `steam_appid.txt` empty, or Steam not running, the shell still plays: it
says why on the console, and co-op falls back to tabs on one machine.

`npx electron . --smoke` boots hidden, prints what the game sees and quits.
`python tests/shell/check.py` tests the whole Steam path against a fake Steam,
with no client and no App ID.

Nothing here publishes anything. A store page or a public build only happens
from the Steamworks site, by the account owner.
