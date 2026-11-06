"""Unblind paired answers.  python tally_pairs.py KEY judge1.md [judge2.md ...]"""
import sys, json, re
key = json.load(open(sys.argv[1]))
tot = {'new': 0, 'old': 0, 'same': 0}
rows = {}
for f in sys.argv[2:]:
    for line in open(f, encoding='utf-8'):
        m = re.match(r'\s*[*`]*([A-Za-z0-9-]+)[*`]*\s*:\s*[*`]*\s*(A|B|=)\s*[*`]*\s*by\s*(\d)', line)
        if not m or m.group(1) not in key: continue
        s, w, n = m.group(1), m.group(2), int(m.group(3))
        if w == '=' or n == 0: v = 'same'
        else: v = 'new' if (w == 'A') == key[s]['new_is_A'] else 'old'
        tot[v] += 1
        rows.setdefault(s, []).append(f'{v}{"" if v == "same" else n}')
for s in key: print(f'{s:22s}', ' '.join(rows.get(s, ['?'])))
print(tot)
