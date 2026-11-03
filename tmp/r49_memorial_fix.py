from pathlib import Path

p = Path('D:/UILOOP/r49-20261029/b/game/src/scenes/gameover.css')
marker = b'Round 49 selected-build clearance repair'
css = '''
/* Round 49 selected-build clearance repair: each control and card has its own row. */
.go-ledger[data-fold] { grid-template-areas: "head" "fold" "guide" "page"; grid-template-rows: auto auto auto minmax(0, 1fr); }
.go-ledger > .r49-scrollcue--inset { margin: 4px 0 12px; }
.go-wrap { grid-template-rows: auto minmax(min-content, 1fr) auto; }
.go-wrap .go-altar.go-shrine { grid-template-rows: auto minmax(min-content, 1fr) auto; grid-template-areas: "reach reach reach" ". mvp ." "said said said"; padding-top: var(--shrine-in); }
.go-shrine > .go-reach { position: relative; left: auto; top: auto; translate: none; grid-area: reach; width: auto; max-width: 100%; margin: 0; align-self: start; }
.go-shrine > .go-block--mvp { align-self: start; margin-top: 16px; }
'''
data = p.read_bytes()
if marker not in data:
    p.write_bytes(data + css.replace('\n', '\r\n').encode('utf-8'))
print('memorial clearance styles saved')
footer = '''
/* The record cue occupies a real footer row instead of covering inventory. */
.go-foot { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto; row-gap: 12px; justify-items: center; padding-top: 12px; }
.go-foot > .r49-scrollcue { position: relative; top: auto; right: auto; grid-row: 1; justify-self: end; }
.go-foot > .go-acts { grid-row: 2; }
'''
data = p.read_bytes()
if b'The record cue occupies a real footer row' not in data:
    p.write_bytes(data + footer.replace('\n', '\r\n').encode('utf-8'))
