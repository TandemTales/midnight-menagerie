"""Measure real shop rules text against each card's clipping box, at both sizes."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

port, output = sys.argv[1], Path(sys.argv[2])
output.parent.mkdir(parents=True, exist_ok=True)
PROBE = r'''() => [...document.querySelectorAll('.sh-card .mm-card')].map(card => {
  const rules = card.querySelector('.mm-card__rules'), r = rules.getBoundingClientRect();
  const style = getComputedStyle(rules), scale = r.width / rules.offsetWidth;
  const scrollable = /auto|scroll/.test(style.overflowY) && rules.scrollHeight > rules.clientHeight + 1;
  const bottom = r.top + (scrollable ? rules.scrollHeight : rules.clientHeight) * scale;
  const range = document.createRange(), walker = document.createTreeWalker(rules, NodeFilter.SHOW_TEXT);
  const clipped = [], covered = [];
  const nameBox = card.querySelector('.mm-card__name').getBoundingClientRect();
  let n, lines = 0;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    range.selectNodeContents(n);
    for (const q of range.getClientRects()) {
      if (!q.width || !q.height) continue;
      lines++;
      if (q.left < nameBox.right - 2 && q.right > nameBox.left + 2 &&
          q.top < nameBox.bottom - 2 && q.bottom > nameBox.top + 2)
        covered.push({text:n.textContent.trim(), by:'name banner'});
      if (q.top < r.top - 2 || q.bottom > bottom + 2 || q.left < r.left - 2 || q.right > r.right + 2)
        clipped.push({text:n.textContent.trim(), top:q.top-r.top, bottom:q.bottom-bottom, left:q.left-r.left, right:q.right-r.right});
    }
  }
  return {name:card.querySelector('.mm-card__name').textContent, lines, scrollable,
    rulesHeight:r.height, contentHeight:rules.scrollHeight*scale,
    fontSize:parseFloat(style.fontSize)*scale, clipped, covered};
})'''

results, errors = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome')
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    context.route('**/favicon.ico', lambda route: route.fulfill(status=204, body=''))
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'http://localhost:{port}/game/index.html#scene=shop&seed=7&companion=bones&kid=maya')
    page.wait_for_function('window.MM && MM.ctx.stage.warmStage === "done" && document.querySelectorAll(".sh-card .mm-card").length === 5', timeout=150000)
    page.evaluate('document.fonts.ready')
    for width, height in [(1280, 800), (1600, 900)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(1500)
        cards = page.evaluate(PROBE)
        results.append({'viewport': [width, height], 'cards': cards})
        print(width, [(c['name'], len(c['clipped']), len(c['covered'])) for c in cards], flush=True)
    browser.close()
output.write_text(json.dumps({'results': results, 'errors': errors}, indent=2), encoding='utf-8')
assert not errors, errors
assert all(not card['clipped'] and not card['covered'] for row in results for card in row['cards']), 'Card text is clipped or covered; inspect the saved measurements'
