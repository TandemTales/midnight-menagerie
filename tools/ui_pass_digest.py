"""Read a finished UI-pass round: winners, means, builds, verdicts, and the next brief's evidence.

    python tools/ui_pass_digest.py <Workflow task output file> [track|all]
    python tools/ui_pass_digest.py <file> combat --notes FLINT,GARNET   # a build's kit changes and merge notes
    python tools/ui_pass_digest.py <file> polish --worst ACORN          # each judge's worst_problem for ACORN, and every graft

The next round's fix list comes from --worst on the winner (a judge's
winner_fixes aim at that judge's own winner) plus the grafts. Set
PYTHONIOENCODING=utf-8 on Windows: the judges write curly quotes and stars.
"""
import json, sys, textwrap

F = sys.argv[1]
part = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else "all"
notes = []
worst = None
if "--notes" in sys.argv:
    notes = sys.argv[sys.argv.index("--notes") + 1].split(",")
if "--worst" in sys.argv:
    worst = sys.argv[sys.argv.index("--worst") + 1]
R = json.load(open(F, encoding="utf-8"))["result"]

for key, T in R.items():
    if part not in ("all", key):
        continue
    print("\n" + "=" * 100)
    print(f"{T['track']} ({T['rule']}): winner {T['winner']} ({T.get('winnerHow')})")
    for s, c in T["screenWinners"].items():
        print(f"   {s}: {c} ({(T.get('screenHow') or {}).get(s)})")
    for s in T["summary"]:
        per = ", ".join(f"{p['screen']} {p['mean']:.2f}" for p in s["per"])
        print(f"   {s['code']:7} mean {s['mean']:.3f}   [{per}]")
    print("-- builds")
    for b in T["builds"]:
        print(f"   {b['code']} {b['branch']} {b['commit'][:10]} endings_ok={b['endings_ok']} console_errors={b['console_errors']} self={b.get('self_score')} files={len(b['touched_files'])}")
        if b["code"] in notes:
            print("     TOUCHED:", ", ".join(b["touched_files"]))
            print("     KIT_CHANGES:\n" + textwrap.indent(textwrap.fill(b["kit_changes"], 160), "       "))
            print("     NOTES:\n" + textwrap.indent(textwrap.fill(b["notes_for_merger"], 160), "       "))
    for i, v in enumerate(T["verdicts"], 1):
        print(f"-- judge {i}: winner {v['winner']}")
        for s in v["screens"]:
            print(f"      {s['screen']:13} " + "  ".join(f"{c['code']} {c['overall']}" for c in s["candidates"]) + f"   rank {s['ranking']}")
        print("      verdict:", textwrap.shorten(v["verdict"], 900))
        if worst:
            for s in v["screens"]:
                c = next((c for c in s["candidates"] if c["code"] == worst), None)
                if c:
                    print(f"      [{worst} {s['screen']} {c['overall']} bg {c['background']}] {textwrap.shorten(c['worst_problem'], 300)}")
            for g in v["grafts"]:
                print(f"      graft [{g['from']}] {textwrap.shorten(g['idea'], 300)}")
