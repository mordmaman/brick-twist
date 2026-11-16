# Brick Twist

A brick-breaker where every level changes a rule. Levels 1-40 (Worlds 1-8), then Endless.

- Play: open `index.html` (or the GitHub Pages site). It installs as an app and works offline after the first visit.
- Edit: source is in `src/`, tunables are in the `CONFIG` object at the top of `src/config.js`.
- Build: `python3 build.py` inlines everything into `index.html` and writes `sw.js`.
  **Run it before every push**: it stamps the service worker's cache version, so phones pick up the new build.
- Test: `node tests/sim.js` (logic; `--quick` for fewer seeds, `--endless` for the Endless part only),
  `node tests/browser-check.js` (needs Playwright; also checks the PWA over a local server).

## Endless

Reached from the bar under the level list. It opens once World 1 is finished, and each round mixes two
twists (three from round 8) taken only from worlds finished on this device. Rounds are built from a seed in
`src/endless.js`, which also decides which twists may share a round. Lives carry over, with an extra life every
few rounds; best round and best score are kept per difficulty. `CONFIG.endless.unlockAll` opens everything for
testing.

## Installable app (PWA)

- `manifest.json`, `icons/` (drawn by `python3 tools/make_icons.py`), and `sw.js` (built from `src/sw.js`).
- The service worker fetches the page from the network first whenever the device is online, so an update
  reaches players on their next visit; the stored copy is only used offline. Old caches are deleted.
