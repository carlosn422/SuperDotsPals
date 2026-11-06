#!/usr/bin/env python3
"""Regenerates EmojiCatalog.json from Microsoft Fluent Emoji (MIT), pinned to FLUENT_SHA.
Emoji newer than MAX_VERSION are skipped so every glyph renders on supported iOS versions."""
import json, urllib.parse, urllib.request, concurrent.futures as cf, pathlib

FLUENT_SHA = '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc'
MAX_VERSION = 15.0
ORDER_URL = 'https://cdn.jsdelivr.net/npm/unicode-emoji-json@0.9.0/data-ordered-emoji.json'
GROUPS = [('smileys', 'Smileys & People', ['Smileys & Emotion', 'People & Body']), ('animals', 'Animals & Nature', ['Animals & Nature']),
          ('food', 'Food & Drink', ['Food & Drink']), ('activity', 'Activity', ['Activities']), ('travel', 'Travel & Places', ['Travel & Places']),
          ('objects', 'Objects', ['Objects']), ('symbols', 'Symbols', ['Symbols']), ('flags', 'Flags', ['Flags'])]

def fetch(url):
    for _ in range(3):
        try: return json.load(urllib.request.urlopen(url, timeout=30))
        except Exception as e: err = e
    raise err

tree = fetch(f'https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/{FLUENT_SHA}?recursive=1')['tree']
paths = [x['path'] for x in tree]
folders = sorted({p.split('/')[1] for p in paths if p.startswith('assets/') and p.endswith('/metadata.json') and p.count('/') == 2})
pngs = [p for p in paths if p.endswith('.png') and '/3D/' in p]
meta = lambda f: (f, fetch(f'https://raw.githubusercontent.com/microsoft/fluentui-emoji/{FLUENT_SHA}/assets/{urllib.parse.quote(f)}/metadata.json'))
with cf.ThreadPoolExecutor(32) as ex: metas = dict(ex.map(meta, folders))

order = {e: i for i, e in enumerate(fetch(ORDER_URL))}
norm = lambda g: g.replace('\ufe0f', '')
order_norm = {norm(e): i for e, i in order.items()}
items = {k: [] for k, _, _ in GROUPS}
for f, m in metas.items():
    if float(m['fromVersion'].strip('\ufe0f')) > MAX_VERSION: continue
    if any(c.isalpha() for c in m['glyph']): continue  # e.g. ℹ️; the server rejects letters so reactions can't become text
    png = next((p for p in pngs if p.startswith(f'assets/{f}/3D/')), None) or next((p for p in pngs if p.startswith(f'assets/{f}/Default/3D/')), None)
    key = next(k for k, _, src in GROUPS if m['group'] in src)
    rank = order.get(m['glyph'], order_norm.get(norm(m['glyph']), 10**6))
    items[key].append((rank, [m['glyph'], m['cldr'], png[len('assets/'):-len('.png')]]))

out = {'sha': FLUENT_SHA, 'groups': [{'id': k, 'title': t, 'items': [x for _, x in sorted(items[k], key=lambda r: r[0])]} for k, t, _ in GROUPS]}
dest = pathlib.Path(__file__).resolve().parent.parent / 'EmojiCatalog.json'
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print(dest, sum(len(g['items']) for g in out['groups']), 'emoji')
