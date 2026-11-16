# Brick Twist

A brick-breaker where every level changes a rule. Levels 1-40 (Worlds 1-8).

- Play: open `index.html` (or the GitHub Pages site).
- Edit: source is in `src/`, tunables are in the `CONFIG` object at the top of `src/config.js`.
- Build: `python3 build.py` inlines everything into `index.html`.
- Test: `node tests/sim.js` (logic), `node tests/browser-check.js` (needs Playwright).
