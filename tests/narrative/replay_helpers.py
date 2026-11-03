"""Load with exec(Path('tests/narrative/replay_helpers.py').read_text(), globals()).
Requires the existing play_session.py globals: page, ready, fight, record_action.
No browser creation, game state writes, scene jumps, future draws or simulation.
Every loop is bounded. Optional acknowledgement sets live only in this Python REPL.
"""
import re


class ReplayStop(Exception):
    pass


_REVIEWED = {'cards': set(), 'intents': set(), 'conditions': set()}


def replay_scene():
    return page.evaluate('MM.ctx.scenes.currentName')  # read-only


def replay_settle():
    page.wait_for_function('window.MM && !MM.ctx.scenes.busy', timeout=30000)
    return replay_scene()


def replay_record(label, value):
    record_action({'helper': label, 'observed': value})
    print(label, value, flush=True)


def reward_offers():
    """Only the presently rendered reward cards, not deck/RNG/future offers."""
    if replay_settle() != 'reward':
        raise ReplayStop('Not a reward scene')
    offers = page.locator('.rw-slot:visible').evaluate_all(
        '(es)=>es.map(e=>({name:e.querySelector(".mm-card__name").innerText, '
        'text:e.innerText, selected:e.getAttribute("aria-selected")==="true"}))')
    replay_record('reward offers', offers)
    return offers


def reward_choose(preferred=(), leave=True):
    """Take the first exact offered name in preferred; otherwise Take none.
    This is an explicit operator policy, not an inferred best-card judgment.
    Exits via the real footer and returns whatever scene follows, including story.
    """
    offers = reward_offers()
    wanted = next((i for name in preferred for i, offer in enumerate(offers)
                   if offer['name'].casefold() == name.casefold()), None)
    if offers:
        if wanted is None:
            skip = page.locator('.rw-skip:visible')
            if skip.count() != 1 or not skip.is_enabled():
                raise ReplayStop('Reward already resolved or skip unavailable; inspect manually')
            replay_record('reward choice', 'Take none')
            skip.click()
        else:
            replay_record('reward choice', offers[wanted]['name'])
            slot = page.locator('.rw-slot:visible').nth(wanted)
            if slot.get_attribute('aria-selected') != 'true':
                slot.focus(); slot.press('Enter')
            if slot.get_attribute('aria-selected') != 'true':
                raise ReplayStop('Reward selection was not acknowledged')
    if not leave:
        return replay_scene()
    return leave_room()


def leave_room():
    """Press the current room's explicit exit; never assume a map follows.
    Call only once the operator has finished that room's decisions.
    """
    scene = replay_settle()
    if scene in ('combat', 'narrative', 'map'):
        raise ReplayStop('Not a room exit: ' + scene)
    button = page.locator('.rm-go:visible')
    if button.count() != 1 or not button.is_enabled():
        raise ReplayStop('No single enabled room-exit control')
    replay_record('room exit', button.inner_text())
    button.click()
    page.wait_for_function('(old)=>!MM.ctx.scenes.busy && MM.ctx.scenes.currentName!==old',
                           arg=scene, timeout=30000)
    result = replay_settle()
    replay_record('arrived', result)
    return result


def journal_read_new(limit=30, close=True):
    """Read top-level observation buttons and their closer text only.
    No hypotheses, investigative checks, comparisons, physical clue choices,
    Kid/Companion conversations or reunion buttons are selected automatically.
    Returns actual text for editorial inspection; does not claim a human read it.
    """
    limit = min(max(int(limit), 1), 50)
    if page.locator('dialog[open]').count():
        raise ReplayStop('A dialog is already open; inspect it first')
    button = page.get_by_role('button', name='Discoveries', exact=True)
    if button.count() != 1:
        raise ReplayStop('Discoveries is not available here')
    button.click()
    dialog = page.locator('dialog[open][aria-label="Discoveries"]')
    dialog.wait_for(state='visible')
    texts = []
    for _ in range(limit):
        # Direct children exclude nested story-case buttons and all choices.
        observations = dialog.locator(':scope > section:not(.story-conversations) > button')
        if not observations.count():
            break
        button = observations.first
        if not button.is_enabled():
            raise ReplayStop('Observation disabled or saving; inspect journal')
        title = button.inner_text()
        index = button.evaluate('(e)=>[...e.parentElement.parentElement.children].filter(x=>x.tagName==="SECTION").indexOf(e.parentElement)')
        section = dialog.locator(':scope > section').nth(index)
        button = section.locator(':scope > button')
        replay_record('read observation', title)
        button.click()
        button.wait_for(state='detached', timeout=10000)
        closer = section.locator(':scope > details:not([open]) > summary').filter(has_text=re.compile('^Look closer$'))
        if closer.count():
            closer.first.click()
        texts.append({'title': title, 'text': section.inner_text()})
    if dialog.locator(':scope > section:not(.story-conversations) > button').count():
        raise ReplayStop('Observation limit reached; journal left open')
    # Previously recorded clues can have an unread, currently available closer.
    for record in dialog.locator(':scope > details[data-clue]').all()[:50]:
        summary = record.locator(':scope > summary')
        if record.get_attribute('open') is None:
            summary.click()
        closer = record.get_by_text('Examine it more closely here', exact=True)
        if closer.count() and closer.locator('..').get_attribute('open') is None:
            closer.click()
            texts.append({'title': summary.inner_text(), 'text': record.inner_text()})
    replay_record('journal text', texts)
    pending = dialog.locator('.story-case button:visible').all_text_contents()
    replay_record('manual investigation controls untouched', pending)
    if close:
        dialog.get_by_role('button', name='Close discoveries', exact=True).click()
        dialog.wait_for(state='detached')
    return texts


def _review_signature(value):
    # Numeric changes do not make a familiar telegraph a new mechanic.
    return re.sub(r'\d+', '#', value or '').strip()


def _visible_combat_signatures():
    if replay_scene() != 'combat':
        return None
    if page.evaluate('MM.ctx.scenes.current.arena === "boss"'):
        raise ReplayStop('Boss: manual review required')
    b = board()  # existing read-only helper, rendered hand + telegraphs only
    return {
        'cards': {_review_signature(c['text']) for c in b['cards']},
        'intents': {_review_signature(x) for x in b['enemies']},
        'conditions': {_review_signature(x) for x in b['conditions']},
    }


def review_current_board():
    """Explicit operator acknowledgement AFTER reading the current board.
    Adds only presently visible rule text; never preauthorizes future cards.
    """
    current = _visible_combat_signatures()
    if current is None:
        raise ReplayStop('No combat board to review')
    for key, values in current.items():
        _REVIEWED[key].update(values)
    replay_record('operator reviewed board', {k: sorted(v) for k, v in current.items()})


def _guard_reviewed():
    if page.locator('dialog[open],.mm-modal:visible').count():
        raise ReplayStop('Choice/help dialog requires manual handling')
    current = _visible_combat_signatures()
    if current is not None:
        new = {k: sorted(v - _REVIEWED[k]) for k, v in current.items() if v - _REVIEWED[k]}
        if new:
            replay_record('new visible mechanic: review before continuing', new)
            raise ReplayStop('Unreviewed rule text')


def routine_replay(maxrooms=3, preferred=(), turns_per_fight=8):
    """Bounded real-control continuation, stopping at any decision/new rule.
    Only automatically enters a map with exactly ONE legal node, a Scuffle.
    Route branches and every other node type remain manual. Existing fight()
    tactics remain unchanged, but its ready() calls are guarded before inputs.
    """
    maxrooms = min(max(int(maxrooms), 1), 12)
    turns_per_fight = min(max(int(turns_per_fight), 1), 12)
    original_ready = globals()['ready']
    rooms = 0
    def checked_ready():
        _guard_reviewed()
        original_ready()
        _guard_reviewed()
    try:
        globals()['ready'] = checked_ready
        for _ in range(maxrooms * 3 + 3):
            scene = replay_settle()
            if scene == 'combat':
                _guard_reviewed()
                fight(turns_per_fight)
                if replay_scene() == 'combat':
                    raise ReplayStop('Fight turn limit reached')
            elif scene == 'reward':
                reward_choose(preferred)
                rooms += 1
                if rooms >= maxrooms:
                    raise ReplayStop('Room limit reached')
            elif scene == 'map':
                nodes = page.locator('.map-node.is-legal:visible')
                if nodes.count() != 1 or nodes.first.get_attribute('data-type') != 'scuffle':
                    replay_record('manual route decision', nodes.evaluate_all('(es)=>es.map(e=>e.getAttribute("aria-label"))'))
                    raise ReplayStop('Route choice or nonroutine room')
                replay_record('enter routine room', nodes.first.get_attribute('aria-label'))
                nodes.first.click()
                page.wait_for_function('MM.ctx.scenes.currentName!=="map" && !MM.ctx.scenes.busy', timeout=30000)
            else:
                raise ReplayStop('Manual scene: ' + scene)
        raise ReplayStop('Transition limit reached')
    except ReplayStop as stop:
        replay_record('STOP', str(stop))
        return {'scene': replay_scene(), 'rooms': rooms, 'reason': str(stop)}
    finally:
        globals()['ready'] = original_ready
