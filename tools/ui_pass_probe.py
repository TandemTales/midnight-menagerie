"""Dry-run a UI pass round's workflow in Chromium, with no agent spawned.

    python tools/ui_pass_probe.py docs/ui-pass/round-3.args.json
    python tools/ui_pass_probe.py docs/ui-pass/round-2.args.json --replay <result file>

docs/ui-pass/round-workflow.js runs nine builders and six to nine judges for
about five hours, so a wrong path, code or brief in a round's args costs a whole
round. This runs the real script with agent() mocked, before the launch:

  mocks     every builder and judge returns a stand-in. Prints the agents that
            would run, the most builders running at once, the winners the
            decision code picks, and one builder's and one judge's full prompt,
            so the worktree, judging and brief paths can be read.
  --replay  agent() returns the builds and verdicts recorded in a finished run
            (the Workflow task's output file, whose "result" is keyed by track),
            so a change to the decision code is checked against real judges.

There is no Node on this machine: Chromium runs the script.
"""
import argparse
import asyncio
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HARNESS = r"""
async ([body, args, replay]) => {
  const logs = [], labels = [], prompts = {}
  let building = 0, most = 0
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const parallel = thunks => Promise.all(thunks.map(t => {
    try { return Promise.resolve(t()).catch(() => null) } catch (e) { return Promise.resolve(null) }
  }))
  async function agent(prompt, opts) {
    labels.push(opts.label); prompts[opts.label] = prompt
    if (opts.phase === 'Build') {
      const code = /UI builder (\w+)/.exec(prompt)[1]
      building++; most = Math.max(most, building)
      try {
        await sleep(20 + (code.charCodeAt(0) * 7 + code.charCodeAt(1)) % 60)
        if (replay) return replay[opts.label] || null
        return { code, branch: 'b', commit: 'c', screenshots: [], touched_files: [], kit_changes: '',
                 endings_ok: true, console_errors: 0, notes_for_merger: '', self_score: 7 }
      } finally { building-- }
    }
    await sleep(5)
    if (replay) return replay[opts.label] || null
    const order = /Candidates are named ([^.]+)\. View/.exec(prompt)[1].split(', ')
    const screens = [...prompt.matchAll(/^- ([\w-]+): /gm)].map(m => m[1])
    return {
      screens: screens.map(s => ({ screen: s, ranking: order, candidates: order.map((c, i) => ({
        code: c, ornament: 5, palette: 5, typography: 5, material: 5, background: 5, composition: 5,
        readability: 5, coherence: 5, overall: 8 - i, fits_between_samples: false, worst_problem: 'mock' })) })),
      winner: order[0], screen_winners: screens.map(s => ({ screen: s, code: order[0] })),
      winner_fixes: [], grafts: [], verdict: 'mock',
    }
  }
  const run = new Function('args', 'agent', 'parallel', 'pipeline', 'log', 'phase',
    `return (async () => {\n${body}\n})()`)
  const result = await run(args, agent, parallel, null, m => logs.push(m), () => {})
  const out = {}
  for (const [k, r] of Object.entries(result)) {
    out[k] = { builds: r.builds.length, verdicts: r.verdicts.length, winner: r.winner, how: r.winnerHow,
               screens: r.screenWinners, screenHow: r.screenHow }
  }
  return { labels, most, logs, out, prompts }
}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("args_file", help="docs/ui-pass/round-<n>.args.json")
    ap.add_argument("--replay", help="a finished Workflow task's output file")
    ap.add_argument("--repo", default=ROOT.replace("\\", "/"))
    ap.add_argument("--uiloop", default="C:/UILOOP")
    ap.add_argument("--base", default="BASE")
    a = ap.parse_args()

    body = open(os.path.join(ROOT, "docs/ui-pass/round-workflow.js"), encoding="utf-8").read()
    body = body.replace("export const meta", "const meta", 1)
    args = json.load(open(os.path.join(ROOT, a.args_file), encoding="utf-8"))
    args.update(repo=a.repo, uiloop=a.uiloop, base=a.base)

    replay = None
    if a.replay:
        recorded = json.load(open(a.replay, encoding="utf-8"))["result"]
        replay = {}
        for T in recorded.values():
            for b in T["builds"]:
                replay[f"{T['track']} build {b['code']}"] = b
            for i, v in enumerate(T["verdicts"]):
                replay[f"{T['track']} judge {i + 1}" if i < 2 else f"{T['track']} judge 3 (tiebreak)"] = v

    async def go():
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            await page.goto("about:blank")
            r = await page.evaluate(HARNESS, [body, args, replay])
            await browser.close()
            return r

    r = asyncio.run(go())
    builders = [l for l in r["labels"] if " build " in l]
    print(f"agents {len(r['labels'])}: {len(builders)} builders, {len(r['labels']) - len(builders)} judges; "
          f"at most {r['most']} building at once (maxBuilders {args.get('maxBuilders', 'unset')})")
    for k, t in r["out"].items():
        print(f"  {k}: {t['builds']} builds, {t['verdicts']} verdicts, winner {t['winner']} ({t['how']})")
        for s, code in (t["screens"] or {}).items():
            print(f"      {s}: {code} ({(t['screenHow'] or {}).get(s)})")
    if not replay:
        last = args["tracks"][-1]
        first = args["tracks"][0]
        print(f"\n=== {last['name']} build {last['builders'][0]['code']} ===\n"
              + r["prompts"][f"{last['name']} build {last['builders'][0]['code']}"])
        print(f"\n=== {first['name']} judge 1 ===\n" + r["prompts"][f"{first['name']} judge 1"])
    return 0


if __name__ == "__main__":
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    sys.exit(main())
