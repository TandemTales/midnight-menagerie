// Source-level copy regression. Browser layout/focus remain separate checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const source = fs.readFileSync(path.join(root, 'game/src/scenes/select.js'), 'utf8').replace(/\r\n/g, '\n');
  const { KIDS, COMPANIONS } = await import(pathToFileURL(path.join(root, 'game/src/data/schema.js')).href);
  const start = source.indexOf('const COMPANION_SPECIES =');
  const end = source.indexOf('\nexport class SelectScene', start);
  assert(start >= 0 && end > start, 'Actual selection copy helpers must be located');
  const Save = { data: { narrative: { sanctuary: false }, petsRescued: [] } };
  const context = vm.createContext({ Save, KIDS, COMPANION_BY_SLUG: Object.fromEntries(COMPANIONS.map(c => [c.slug, c])) });
  vm.runInContext(source.slice(start, end), context);
  let checks = 0;
  for (const state of ['first-search', 'partial-home', 'all-home']) {
    Save.data.narrative.sanctuary = state !== 'first-search';
    Save.data.petsRescued = state === 'all-home' ? KIDS.map(k => k.slug) : state === 'partial-home' ? ['maya'] : [];
    const before = JSON.stringify(Save.data);
    for (const kid of KIDS) {
      const label = context.selectionPetLabel(kid);
      assert.equal(label, state === 'first-search' ? `looking for ${kid.pet}` : `revisit ${kid.pet}’s search`);
      checks++;
      for (const companion of COMPANIONS) {
        const note = context.pairingNote(companion.slug, kid.slug);
        assert(note.includes(kid.pet) && note.includes(companion.name));
        assert(!/was once the same|remembers being found|collar tag/.test(note));
        if (state !== 'first-search') {
          assert(note.includes('revisit the search'));
          assert(note.includes('The gate is open today. Pets already home stay home.'));
          assert(!/is looking for|does not know|all pets are home/i.test(note));
        }
        checks++;
      }
    }
    assert.equal(JSON.stringify(Save.data), before, 'Selection copy must not change pet or sanctuary state');
  }
  // Check actual presentation call sites, not just an unused helper.
  assert(source.includes('<span class="kid-tile__pet">${selectionPetLabel(k)}</span>'));
  assert(source.includes("b.setAttribute('aria-label', `${k.name}, ${selectionPetLabel(k)}`)"));
  assert(source.includes("this._setChip('kid', k.name, selectionPetLabel(k))"));
  assert(source.includes("plaque: Save.data.narrative.sanctuary ? 'An earlier night' : 'Menagerie Companions'"));
  assert(source.includes("Save.data.narrative.sanctuary ? 'Earlier search' : 'Missing'"));
  assert(source.includes('Revisit the search. Pets already home stay home.'));
  assert(source.includes('`Wing: ${REGION_NAMES[c.region] ?? c.region}`'));
  assert(source.includes('<span class="sel__boardcount"><b>${this.freed.size}</b> freed'));
  assert(!source.includes('${this.freed.size}</b> / ${COMPANIONS.length} freed'));
  console.log(`${checks} actual-helper copy checks passed across first-search, partial-home and all-home saves; presentation call sites verified. Browser rendering not tested.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
