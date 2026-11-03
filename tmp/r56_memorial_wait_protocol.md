# Shared memorial synchronization correction

The inherited memorial test calls scrollTop=scrollHeight, sleeps150ms, then
asserts the cue's data-end is true. The product updates this cue on an animation
frame;150ms is a test settling delay, not a specified product latency target.
Round56 retained one failure of that delay. Its unchanged functional assertion
passes with a bounded predicate wait; a separate probe observed fresh Tricks
transitions in35.8/47.2ms. Do not claim the original failure passed or infer a
general latency guarantee from those two samples.

For future execution, a candidate-owned copy of tests/ui-r51-spinel/memorial.py
may replace ONLY page.wait_for_timeout(150) immediately before the end-state
assertion with the following block (same indentation). Keep the inherited file
unchanged, preserve every original assertion and every other statement, and use
the owned copy for both normal and long-deck modes. This is common test guidance,
not sibling design/source. Root's AST audit permits precisely this replacement.

    try:
        page.wait_for_function("label=>document.querySelector('.r49-scrollcue[data-board-scroll='+label+']')?.dataset.end==='true'",arg=label,timeout=5000)
    except Exception:
        (out/'end-state-failure.json').write_text(json.dumps({'size':[w,h],'label':label,'state':page.locator(scroller).evaluate("e=>({top:e.scrollTop,height:e.scrollHeight,client:e.clientHeight})"),'cueEnd':cue.get_attribute('data-end')},indent=2),encoding='utf-8')
        raise

Retain the following original assert and end-to-top checks. Report use of this
test-only synchronization fix. If a run already failed, preserve its actual
source, output, images and result before retrying only affected checks. Do not
erase failures, remove predicates, change game behavior for a test or claim a
specific latency without a fresh measured transition.
