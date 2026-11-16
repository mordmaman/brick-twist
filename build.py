#!/usr/bin/env python3
"""Build Brick Twist: inline src/*.js into a single self-contained index.html.

Usage: python3 build.py
No external requests of any kind end up in the output (checked below).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')

# Load order matters: config first, main last.
ORDER = [
    'config.js', 'physics.js', 'bricks.js', 'rules.js', 'bosses.js', 'levels.js',
    'game.js', 'save.js', 'particles.js', 'audio.js', 'render.js', 'input.js', 'ui.js', 'main.js',
]

CSS = """
html, body {
  margin: 0; padding: 0; width: 100%; height: 100%;
  background: #05060d; overflow: hidden;
  overscroll-behavior: none; touch-action: none;
  -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
}
body { position: fixed; inset: 0; }
canvas { display: block; position: absolute; left: 0; top: 0; touch-action: none; outline: none; }
noscript { color: #fff; font: 16px system-ui, sans-serif; display: block; padding: 24px; }
"""

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#05060d">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="description" content="Brick Twist: a brick-breaker where every level changes a rule.">
<title>Brick Twist</title>
<style>{css}</style>
</head>
<body>
<canvas id="game" tabindex="0" aria-label="Brick Twist game"></canvas>
<noscript>Brick Twist needs JavaScript switched on.</noscript>
<script>
{js}
</script>
</body>
</html>
"""


def main():
    parts = []
    for name in ORDER:
        path = os.path.join(SRC, name)
        with open(path, encoding='utf-8') as f:
            code = f.read()
        if re.search(r'</script', code, re.I):
            sys.exit('build: %s contains "</script"' % name)
        parts.append('// ---- %s ----\n%s' % (name, code.strip()))
    extra = sorted(set(f for f in os.listdir(SRC) if f.endswith('.js')) - set(ORDER) - {'editor.js'})
    if extra:
        print('build: note, not included:', ', '.join(extra))

    html = TEMPLATE.replace('{css}', CSS.strip()).replace('{js}', '\n\n'.join(parts))

    # Self-contained check: no external URLs, imports or fetches.
    bad = re.findall(r'(https?://|//cdn|@import|\bfetch\(|<link\b|\bsrc=)', html)
    if bad:
        sys.exit('build: output references external resources: %s' % sorted(set(bad)))

    out = os.path.join(ROOT, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('build: wrote %s (%.1f KB, %d source files)' % (os.path.relpath(out, ROOT), len(html.encode('utf-8')) / 1024, len(ORDER)))


if __name__ == '__main__':
    main()
