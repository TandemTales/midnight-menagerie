"""Run the audio self-test in a real browser and print the result.

    python tests/audio/run.py [--keep] [--no-images] [--timeout 300]

Opens http://localhost:8777/tests/audio/index.html?autotest=1, which renders
every synthesised SFX cue through the real master bus inside an
OfflineAudioContext and asserts:

    * non-silent output
    * no sample above 0.99 (the bus limiter caps at 0.94)
    * no DC offset
    * no click at the start or end, no single-sample discontinuity
    * inside the per-family duration budget (1.2 s for sfx, 3 s for stingers)
    * the per-play variation actually changes the render

It also writes a waveform + spectrogram strip per cue to shots/audio-<id>.png
so the envelopes can be eyeballed.

Exit code = number of errors (0 = clean).
"""
import argparse
import asyncio
import base64
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, "shots")
URL = "http://localhost:8777/tests/audio/index.html?autotest=1"


async def run(a):
    from playwright.async_api import async_playwright

    os.makedirs(SHOTS, exist_ok=True)
    logs, errors = [], []

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=[
            "--autoplay-policy=no-user-gesture-required",
            "--enable-unsafe-swiftshader",
            "--force-color-profile=srgb",
        ])
        page = await (await browser.new_context(viewport={"width": 1500, "height": 1000})).new_page()
        page.on("console", lambda m: (logs.append(f"[{m.type}] {m.text}"),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        await page.goto(URL, wait_until="load", timeout=60000)
        try:
            await page.wait_for_function("window.__AUDIO_TEST__ && window.__AUDIO_TEST__.done",
                                         timeout=int(a.timeout * 1000))
        except Exception as e:
            print("TIMED OUT waiting for self-test:", e, file=sys.stderr)
            prog = await page.evaluate("document.querySelector('#progress')?.textContent")
            print("progress was:", prog, file=sys.stderr)
            for line in logs[-40:]:
                print("  " + line[:300], file=sys.stderr)
            await browser.close()
            return 99

        res = await page.evaluate("window.__AUDIO_TEST__")
        print(res["text"])

        if not a.no_images:
            pngs = await page.evaluate("window.__AUDIO_PNGS__ || {}")
            for cid, data in pngs.items():
                safe = cid.replace(":", "-")
                raw = base64.b64decode(data.split(",", 1)[1])
                open(os.path.join(SHOTS, f"audio-{safe}.png"), "wb").write(raw)
            print(f"\nwrote {len(pngs)} waveform strips to shots/audio-*.png")

        open(os.path.join(SHOTS, "audio-selftest.json"), "w", encoding="utf-8").write(
            json.dumps({"summary": {k: res[k] for k in ("cues", "errors", "warnings", "musicCues")},
                        "results": res["results"], "console": logs[-80:]}, indent=1))

        if not a.keep:
            await browser.close()
        else:
            print("\n--keep: browser left open, ctrl-c to quit")
            await asyncio.sleep(3600)

    if errors:
        print("\nJS console errors:", file=sys.stderr)
        for e in errors[:20]:
            print("  " + e[:400], file=sys.stderr)
    return int(res["errors"]) + (len(errors) if a.strict else 0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--no-images", action="store_true")
    ap.add_argument("--strict", action="store_true", help="count console errors too")
    ap.add_argument("--timeout", type=float, default=420)
    sys.exit(asyncio.run(run(ap.parse_args())))
