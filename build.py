#!/usr/bin/env python3
"""Build Brick Twist: inline src/*.js into a single self-contained index.html, and write sw.js.

Usage: python3 build.py   (run it before every push: it also stamps the service worker version)
No external requests of any kind end up in the output (checked below). The only files the page refers to are
the same-origin relative PWA files listed in PWA_FILES (manifest, icons, service worker).
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')

# Load order matters: config first, main last.
ORDER = [
    'config.js', 'physics.js', 'bricks.js', 'rules.js', 'bosses.js', 'levels.js', 'endless.js',
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
<meta name="apple-mobile-web-app-title" content="Brick Twist">
{links}
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


# The page's only references: same-origin relative files that ship next to index.html (the installable PWA).
LINKS = [
    '<link rel="manifest" href="manifest.json">',
    '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
]
# Everything the service worker keeps for offline play ('./' is the page itself).
PWA_FILES = ['manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png']


def write_sw(html):
    # The cache name carries a hash of everything it caches, so every build that changes anything gets a new
    # cache (and the old ones are deleted when the new worker activates). Nobody has to bump a number.
    h = hashlib.sha256(html.encode('utf-8'))
    for rel in PWA_FILES:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            sys.exit('build: missing %s (run python3 tools/make_icons.py)' % rel)
        with open(path, 'rb') as f:
            h.update(rel.encode('utf-8')); h.update(f.read())
    with open(os.path.join(SRC, 'sw.js'), encoding='utf-8') as f:
        sw = f.read()
    version = h.hexdigest()[:12]
    files = ',\n  '.join("'%s'" % x for x in ['./'] + PWA_FILES)
    if '__VERSION__' not in sw or '__FILES__' not in sw:
        sys.exit('build: src/sw.js is missing its __VERSION__ / __FILES__ placeholders')
    sw = sw.replace('__VERSION__', version).replace('__FILES__', files)
    with open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8') as f:
        f.write(sw)
    return version


def main():
    parts = []
    for name in ORDER:
        path = os.path.join(SRC, name)
        with open(path, encoding='utf-8') as f:
            code = f.read()
        if re.search(r'</script', code, re.I):
            sys.exit('build: %s contains "</script"' % name)
        parts.append('// ---- %s ----\n%s' % (name, code.strip()))
    extra = sorted(set(f for f in os.listdir(SRC) if f.endswith('.js')) - set(ORDER) - {'editor.js', 'sw.js'})
    if extra:
        print('build: note, not included:', ', '.join(extra))

    html = TEMPLATE.replace('{css}', CSS.strip()).replace('{links}', '\n'.join(LINKS)).replace('{js}', '\n\n'.join(parts))

    # Self-contained check: no external URLs, imports or fetches. The allowed PWA links are taken out first,
    # and must stay relative, same-origin files.
    for link in LINKS:
        if not re.fullmatch(r'<link rel="[a-z -]+"( type="image/png")?( sizes="\d+x\d+")? href="[a-z0-9./-]+">', link) or '//' in link or '..' in link:
            sys.exit('build: not an allowed same-origin relative link: %s' % link)
    bad = re.findall(r'(https?://|//cdn|@import|\bfetch\(|<link\b|\bsrc=)', html.replace('\n'.join(LINKS), ''))
    if bad:
        sys.exit('build: output references external resources: %s' % sorted(set(bad)))

    out = os.path.join(ROOT, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('build: wrote %s (%.1f KB, %d source files)' % (os.path.relpath(out, ROOT), len(html.encode('utf-8')) / 1024, len(ORDER)))
    print('build: wrote sw.js (cache version %s)' % write_sw(html))


if __name__ == '__main__':
    main()
