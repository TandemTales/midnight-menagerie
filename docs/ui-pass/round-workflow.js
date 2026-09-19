export const meta = {
  name: 'ui-pass-round',
  description: 'One round of the Midnight Menagerie UI pass: three builds per track in their own worktrees, two blind judges per track, a third where they disagree',
  whenToUse: 'A round of the UI pass (docs/ui-pass/README.md). args = docs/ui-pass/round-<n>.args.json plus repo, uiloop and base',
  phases: [
    { title: 'Build', detail: 'three builders per track, one worktree and dev server each' },
    { title: 'Judge', detail: 'two blind judges per track, images only, opposite candidate orders' },
    { title: 'Tiebreak', detail: 'a third blind judge where a track\'s judges disagree' },
  ],
}

// Rounds 0 and 1 ran as one-off scripts; this is round 1's, with the tracks,
// briefs and rubrics moved into args so a round is a JSON file. Launch with
//   Workflow({ scriptPath: 'docs/ui-pass/round-workflow.js',
//              args: { ...round-<n>.args.json, repo, uiloop, base } })
// where repo is the main checkout, uiloop the folder OUTSIDE OneDrive holding
// wt/ and judging/, and base the commit the worktrees were cut from. Every
// worktree ${uiloop}/wt/<round>-<track key>-<slot> on branch
// ui/<round>-<track key>-<slot>, and every baseline capture
// ${uiloop}/judging/<round>/<track key>/<baseline code>/<screen>(-1280).png,
// must exist before launch. Pass a subset of tracks to run fewer at once, or
// maxBuilders to queue builders across every track (see buildSlot).

const A = args
const at = p => `${A.repo}/${p}`
const ROUND = String(A.round).replace(/^r/, '')
const BRIEFS = A.briefs.map(at)
const RUBRICS = A.rubrics.map(at)
const SAMPLES = A.samples.map(at)

const BUILD = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    branch: { type: 'string' },
    commit: { type: 'string', description: 'final commit sha on the branch' },
    screenshots: { type: 'array', items: { type: 'string' } },
    touched_files: { type: 'array', items: { type: 'string' } },
    kit_changes: { type: 'string', description: 'every change to kit.css, tokens.css, hud, tooltip or the room shell, one line each' },
    endings_ok: { type: 'boolean' },
    console_errors: { type: 'integer' },
    self_score: { type: 'number' },
    notes_for_merger: { type: 'string', description: 'never shown to judges' },
  },
  required: ['code', 'branch', 'commit', 'screenshots', 'touched_files', 'kit_changes', 'endings_ok', 'console_errors', 'notes_for_merger'],
}

const CAND = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    ornament: { type: 'number' }, palette: { type: 'number' }, typography: { type: 'number' },
    material: { type: 'number' }, background: { type: 'number' }, composition: { type: 'number' },
    readability: { type: 'number' }, coherence: { type: 'number' },
    overall: { type: 'number' },
    fits_between_samples: { type: 'boolean' },
    worst_problem: { type: 'string' },
  },
  required: ['code', 'ornament', 'palette', 'typography', 'material', 'background', 'composition', 'readability', 'coherence', 'overall', 'fits_between_samples', 'worst_problem'],
}

const JUDGE = {
  type: 'object',
  properties: {
    screens: {
      type: 'array',
      items: {
        type: 'object',
        properties: { screen: { type: 'string' }, candidates: { type: 'array', items: CAND }, ranking: { type: 'array', items: { type: 'string' } } },
        required: ['screen', 'candidates', 'ranking'],
      },
    },
    winner: { type: 'string' },
    screen_winners: {
      type: 'array',
      items: { type: 'object', properties: { screen: { type: 'string' }, code: { type: 'string' } }, required: ['screen', 'code'] },
    },
    winner_fixes: { type: 'array', items: { type: 'string' } },
    grafts: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, idea: { type: 'string' } }, required: ['from', 'idea'] } },
    verdict: { type: 'string' },
  },
  required: ['screens', 'winner', 'screen_winners', 'winner_fixes', 'grafts', 'verdict'],
}

const judgingOf = T => `${A.uiloop}/judging/${A.round}/${T.key}`
// The screens that ALSO have a 1280x800 capture. Every screen did until round
// 11, whose contact sheets exist at one size only; a track lists the rest in
// `smallScreens`, and without it every screen has both.
const smallOf = T => T.smallScreens || T.screens

// Round 5's DIALOGS and KIDS' PLACES builders hit the weekly usage limit an hour
// in, with their work half made in their worktrees. Set `resume` on each
// interrupted builder in the args: true, or a string saying where it stopped.
// No other prompt changes. But run ONLY the unfinished tracks as a new run:
// resumeFromRunId replays a finished agent only when it is called in the same
// order, and round 5's resume re-ran POLISH's and COMBAT's four judges on
// byte-identical prompts, because the resumed builders started in a new order.
function resumeNote(b, wt, branch) {
  return [
    `This build was interrupted, and you are finishing it. An earlier run of builder ${b.code}, with this same brief and angle, worked on ${branch} until a usage limit stopped it mid-task. Its work is still in ${wt}, and nothing has touched it since:`,
    `- its commits past BASE: \`git log --stat ${A.base}..HEAD\`;`,
    `- its uncommitted edits, which may be half made: \`git status\` and \`git diff\`.`,
    ...(typeof b.resume === 'string' ? [b.resume] : []),
    `Read the briefs, the samples and the starting screens first, as above. Then read that work and photograph your screens as they stand now. Keep what serves your angle, finish what is half done, and revert only what is broken. No dev server is running for you: start your own on your port. Every Deliverable still applies, the endings guard with --base BASE included.`,
  ].join('\n')
}

function builderPrompt(T, b) {
  const J = judgingOf(T)
  const wt = `${A.uiloop}/wt/${A.round}-${T.key}-${b.slot}`
  const branch = `ui/${A.round}-${T.key}-${b.slot}`
  return [
    `You are UI builder ${b.code} for Midnight Menagerie's art-direction pass, round ${ROUND}, on the ${T.name} track.`,
    ``,
    `Read these briefs in this order, all of each: ${BRIEFS.join(', ')}. Then open the four samples with the Read tool: ${SAMPLES.join(', ')}.`,
    `Then look at the screens as they are now, which are your starting point: ${T.screens.map(s => `${J}/${T.baseline}/${s}.png`).join(', ')}.`,
    ``,
    `Your values - substitute them wherever the briefs say:`,
    `  WT      = ${wt}`,
    `  BRANCH  = ${branch}`,
    `  PORT    = ${b.port}`,
    `  CODE    = ${b.code}`,
    `  BASE    = ${A.base}`,
    `  UILOOP  = ${A.uiloop}`,
    `  JUDGING = ${J}`,
    ``,
    `Your track: ${T.name}. Your screens: ${T.screens.join(', ')}. Obey the "Who owns what this round" section exactly.`,
    ``,
    `Your angle. The other two builders on your track were given different ones, and blind judges will choose:`,
    b.angle,
    ``,
    ...(b.resume ? [resumeNote(b, wt, branch), ``] : []),
    `Work in cycles: change, photograph with tools/shot.py on your own port, Read the PNG beside the samples, change again. Judge yourself as harshly as ${RUBRICS.join(', ')} will. Stop when you honestly believe a judge would score every one of your screens at 9, or when further changes stop improving them.`,
    ``,
    `Finish with: endings guard printing ENDINGS OK, everything committed on ${branch} inside ${wt}, the ${T.screens.length + smallOf(T).length} canonical screenshots (each of ${T.screens.join(', ')} at the default size, and ${smallOf(T).join(', ')} also at 1280x800, named as the brief's Deliverables say) copied into ${J}/${b.code}/, at least two screens outside your track photographed on your port and looked at, your dev server stopped. Never touch the main repository. Return the structured result.`,
  ].join('\n')
}

function judgePrompt(T, order, n) {
  const J = judgingOf(T)
  const lines = [
    `You are blind style judge #${n} on the ${T.name} track. Read ${RUBRICS.join(', then ')}, all of each, and follow them exactly. Where they give different decision rules to different tracks, use the one they give the ${T.name} track.`,
    ``,
    `Reference samples - open all four first: ${SAMPLES.join(', ')}.`,
    ``,
    `Candidates are named ${order.join(', ')}. View them in exactly that order on every screen:`,
  ]
  for (const s of T.screens) lines.push(`- ${s}: ` + order.map(c => `${J}/${c}/${s}.png`).join(' , '))
  lines.push(``, `For the readability score only, also open each candidate's 1280x800 capture of ${smallOf(T).length === T.screens.length ? 'the same screen' : 'the screens that have one'} (same folder, ${smallOf(T).map(s => s + '-1280.png').join(', ')}).`)
  lines.push(``, `Score every candidate on every screen, 0-10. Use the candidate codes exactly as written. screen_winners must name exactly one candidate for each of: ${T.screens.join(', ')}. Return the structured verdict.`)
  return lines.join('\n')
}

function rotate(list, k) { return list.map((_, i) => list[(i + k) % list.length]) }

function table(verdicts) {
  const t = {}
  for (const v of verdicts) for (const s of v.screens) for (const c of s.candidates) {
    const e = ((t[c.code] = t[c.code] || {})[s.screen] = (t[c.code] || {})[s.screen] || { overall: [], fits: [] })
    e.overall.push(c.overall); e.fits.push(c.fits_between_samples)
  }
  return Object.entries(t).map(([code, screens]) => {
    const per = Object.entries(screens).map(([screen, e]) => ({ screen, mean: e.overall.reduce((a, b) => a + b, 0) / e.overall.length, fits: e.fits.every(Boolean) }))
    return { code, per, mean: per.reduce((a, p) => a + p.mean, 0) / per.length }
  }).sort((x, y) => y.mean - x.mean)
}

// Head-to-head wins and Borda points over the judges' rankings, restricted to
// the named screens. A candidate "beats" another when more rankings put it
// above than below.
function rankTally(verdicts, codes, screens) {
  const above = {}, borda = {}
  for (const c of codes) { above[c] = {}; borda[c] = 0 }
  for (const v of verdicts) for (const s of v.screens) {
    if (!screens.includes(s.screen)) continue
    const r = s.ranking.filter(c => codes.includes(c))
    r.forEach((c, i) => {
      borda[c] += r.length - 1 - i
      for (const d of r.slice(i + 1)) above[c][d] = (above[c][d] || 0) + 1
    })
  }
  const wins = c => codes.filter(d => d !== c && (above[c][d] || 0) > (above[d][c] || 0)).length
  return { wins, borda }
}

// A strict majority of the judges' picks decides. Without one, the rankings do:
// head-to-head wins, then Borda, then the mean. Round 2's POLISH judges named
// three different winners, and a plain vote count quietly returned the first
// judge's.
function decide(votes, codes, tally, mean) {
  const n = {}
  for (const x of votes) if (x) n[x] = (n[x] || 0) + 1
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])
  if (top.length && top[0][1] > votes.length / 2) return { code: top[0][0], how: `${top[0][1]} of ${votes.length} judges` }
  const order = codes.slice().sort((a, b) => tally.wins(b) - tally.wins(a) || tally.borda[b] - tally.borda[a] || mean(b) - mean(a))
  return {
    code: order[0] || null,
    how: `no majority (${top.map(([c, k]) => `${c} ${k}`).join(', ') || 'no votes'}); head-to-head wins ${order.map(c => `${c} ${tally.wins(c)}`).join(', ')}; Borda ${order.map(c => `${c} ${tally.borda[c]}`).join(', ')}`,
  }
}

function trackWinner(T, verdicts, summary) {
  const codes = summary.map(r => r.code)
  return decide(verdicts.map(v => v.winner), codes, rankTally(verdicts, codes, T.screens), c => (summary.find(r => r.code === c) || {}).mean ?? -1)
}

function screenWinners(T, verdicts, summary) {
  const codes = summary.map(r => r.code)
  const out = {}, how = {}
  for (const s of T.screens) {
    const votes = verdicts.map(v => (v.screen_winners.find(w => w.screen === s) || {}).code)
    const mean = c => ((summary.find(r => r.code === c) || { per: [] }).per.find(p => p.screen === s) || {}).mean ?? -1
    const d = decide(votes, codes, rankTally(verdicts, codes, [s]), mean)
    out[s] = d.code; how[s] = d.how
  }
  return { out, how }
}

// 'refine': one winner replaces the screens, so the judges disagree when their
// winners differ. 'expand': screens merge one at a time, so any screen counts.
function disagree(T, verdicts) {
  if (verdicts.length < 2) return true
  const [a, b] = verdicts
  if (T.rule === 'refine') return a.winner !== b.winner
  return T.screens.some(s => (a.screen_winners.find(w => w.screen === s) || {}).code !== (b.screen_winners.find(w => w.screen === s) || {}).code)
}

// Every builder runs a dev server and a Chromium, and one capture peaks near
// 0.9 GB on Josh's 16 GB laptop, so nine at once is more than it holds (round 1
// ran six). maxBuilders caps them across all tracks: a queued builder starts the
// moment any builder returns. Judges read images only and never queue.
const MAX_BUILDERS = A.maxBuilders || Infinity
let building = 0
const waiting = []
async function buildSlot(label, run) {
  if (building < MAX_BUILDERS) building++
  else {
    log(`${label} queued: ${MAX_BUILDERS} builders already running`)
    await new Promise(resolve => waiting.push(resolve))
  }
  try { return await run() }
  finally {
    const next = waiting.shift()
    if (next) next()  // the slot passes straight to the next builder
    else building--
  }
}

// A builder that FINISHED in a run a usage limit stopped carries its recorded
// result as `done` (the BUILD object from that run's journal) and is not built
// again: round 12's session limit stopped one builder and every judge while two
// builders had returned. `resumeFromRunId` would replay them only if they were
// called in the same order with byte-identical prompts, and round 5 showed how
// that goes wrong, so the result is passed in explicitly instead.
async function track(T) {
  const built = await parallel(T.builders.map(b => () => {
    if (b.done) {
      log(`${T.name} build ${b.code}: finished in an earlier run, using its recorded result (${b.done.commit})`)
      return Promise.resolve(b.done)
    }
    return buildSlot(`${T.name} build ${b.code}`, () =>
      agent(builderPrompt(T, b), { label: `${T.name} build ${b.code}`, phase: 'Build', schema: BUILD }))
  }))
  const builds = built.filter(Boolean)
  log(`${T.name}: ${builds.length}/${T.builders.length} builders returned: ` + builds.map(b => `${b.code} self ${b.self_score ?? '?'}, endings ${b.endings_ok ? 'ok' : 'NOT OK'}, ${b.console_errors} console errors`).join('; '))
  if (!builds.length) return { track: T.name, rule: T.rule, builds, verdicts: [], winner: null, screenWinners: {}, summary: [] }
  const codes = [...builds.map(b => b.code), T.baseline]
  const orders = [rotate(codes, 1), rotate(codes.slice().reverse(), 2)]
  const judged = await parallel(orders.map((ord, i) => () =>
    agent(judgePrompt(T, ord, i + 1), { label: `${T.name} judge ${i + 1}`, phase: 'Judge', schema: JUDGE, effort: 'high' })))
  const verdicts = judged.filter(Boolean)
  if (disagree(T, verdicts)) {
    const v3 = await agent(judgePrompt(T, rotate(codes, 2), 3), { label: `${T.name} judge 3 (tiebreak)`, phase: 'Tiebreak', schema: JUDGE, effort: 'high' })
    if (v3) verdicts.push(v3)
  }
  const summary = table(verdicts)
  const { code: winner, how: winnerHow } = trackWinner(T, verdicts, summary)
  const { out: sw, how: screenHow } = screenWinners(T, verdicts, summary)
  log(`${T.name}: winner ${winner} (${winnerHow}); screens ${JSON.stringify(sw)}; means ` + summary.map(s => `${s.code} ${s.mean.toFixed(1)}`).join(', '))
  return { track: T.name, rule: T.rule, winner, winnerHow, screenWinners: sw, screenHow, summary, verdicts, builds }
}

const results = await parallel(A.tracks.map(T => () => track(T)))
return Object.fromEntries(A.tracks.map((T, i) => [T.key, results[i]]))
