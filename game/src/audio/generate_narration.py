"""Generate stored ElevenLabs narration assets for Midnight Menagerie.

This is intentionally a build-time tool. It scans authored tutorial and story
text, sends each line to ElevenLabs once, and stores the returned MP3 plus a
local manifest under ``game/assets/audio/voiceover/``. Combat text is not in
this inventory. The browser never calls ElevenLabs and never receives an API
key.

Configuration (PowerShell):

    Copy the repository's ``.env`` template and fill in the values, or set
    the same variables in the current PowerShell session:

    $env:ELEVENLABS_API_KEY = '...'
    $env:ELEVENLABS_VOICE_ID = '...'

Usage:

    python game/src/audio/generate_narration.py

Use ``--limit N`` for a small first batch or ``--dry-run`` to list the static
story lines. Existing files are reused unless ``--force`` is supplied.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "game" / "src"
OUT = ROOT / "game" / "assets" / "audio" / "voiceover"
MANIFEST = OUT / "manifest.json"
API = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


def load_env_file() -> None:
    """Load simple KEY=VALUE entries from the repository-local .env file.

    Explicit process environment variables win, so CI and one-off PowerShell
    overrides continue to work. This deliberately avoids a third-party
    dependency because the generator is otherwise part of the standard
    library only.
    """
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        if not separator:
            continue
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        os.environ[key] = value


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def narration_id(text: str) -> str:
    # Must match narration.js: FNV-1a over UTF-8.
    h = 0x811C9DC5
    for byte in normalize(text).encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"narration-{h:08x}"


def decode_js_string(raw: str) -> str:
    try:
        return str(ast.literal_eval(raw))
    except (SyntaxError, ValueError):
        return raw[1:-1]


def _skip_string(source: str, i: int) -> int:
    """Return the offset after one JS quote/template literal."""
    quote = source[i]
    i += 1
    n = len(source)
    while i < n:
        if source[i] == "\\":
            i += 2
        elif source[i] == quote:
            return i + 1
        else:
            i += 1
    return n


def _skip_space_and_comments(source: str, i: int) -> int:
    n = len(source)
    while i < n:
        if source[i].isspace():
            i += 1
        elif source.startswith("//", i):
            end = source.find("\n", i + 2)
            i = n if end < 0 else end + 1
        elif source.startswith("/*", i):
            end = source.find("*/", i + 2)
            i = n if end < 0 else end + 2
        else:
            break
    return i


def _matching(source: str, start: int) -> int:
    """Find a matching ], }, or ) while ignoring JS strings/comments."""
    pairs = {"[": "]", "{": "}", "(": ")"}
    stack = [pairs[source[start]]]
    i = start + 1
    n = len(source)
    while i < n:
        if source.startswith("//", i):
            end = source.find("\n", i + 2)
            i = n if end < 0 else end + 1
            continue
        if source.startswith("/*", i):
            end = source.find("*/", i + 2)
            i = n if end < 0 else end + 2
            continue
        if source[i] in "'\"`":
            i = _skip_string(source, i)
            continue
        if source[i] in pairs:
            stack.append(pairs[source[i]])
        elif stack and source[i] == stack[-1]:
            stack.pop()
            if not stack:
                return i
        i += 1
    return n


def _iter_properties(source: str, names):
    """Yield (property, colon-offset) outside comments and JS literals."""
    wanted = set(names)
    i = 0
    n = len(source)
    while i < n:
        if source.startswith("//", i):
            end = source.find("\n", i + 2)
            i = n if end < 0 else end + 1
            continue
        if source.startswith("/*", i):
            end = source.find("*/", i + 2)
            i = n if end < 0 else end + 2
            continue
        if source[i] in "'\"`":
            i = _skip_string(source, i)
            continue
        if source[i].isalpha() or source[i] in "_$":
            start = i
            i += 1
            while i < n and (source[i].isalnum() or source[i] in "_$"):
                i += 1
            name = source[start:i]
            j = _skip_space_and_comments(source, i)
            if name in wanted and j < n and source[j] == ":":
                yield name, j
            continue
        i += 1


def _static_string(source: str, start: int):
    """Read one or more JS string literals joined with +."""
    i = _skip_space_and_comments(source, start)
    if i >= len(source) or source[i] not in "'\"":
        return None, start
    parts = []
    first = i
    while i < len(source) and source[i] in "'\"":
        end = _skip_string(source, i)
        parts.append(decode_js_string(source[i:end]))
        i = _skip_space_and_comments(source, end)
        if i >= len(source) or source[i] != "+":
            break
        i = _skip_space_and_comments(source, i + 1)
        if i >= len(source) or source[i] not in "'\"":
            return None, start
    return normalize("".join(parts)), first


def _array_values(source: str, start: int):
    i = _skip_space_and_comments(source, start)
    if i >= len(source) or source[i] != "[":
        return []
    end = _matching(source, i)
    values = []
    cursor = i + 1
    while cursor < end:
        cursor = _skip_space_and_comments(source, cursor)
        if cursor >= end:
            break
        value, first = _static_string(source, cursor)
        if value:
            values.append((value, source.count("\n", 0, first) + 1))
            cursor = _skip_space_and_comments(source, first)
            cursor = _skip_string(source, cursor)
            # Consume a complete + string chain before the comma.
            while True:
                probe = _skip_space_and_comments(source, cursor)
                if probe >= end or source[probe] != "+":
                    cursor = probe
                    break
                probe = _skip_space_and_comments(source, probe + 1)
                cursor = _skip_string(source, probe)
            if cursor < end and source[cursor] == ",":
                cursor += 1
                continue
        # Non-string expressions (including runtime template strings) are not
        # sent to ElevenLabs; skip to the next top-level array comma.
        depth = 0
        while cursor < end:
            if source[cursor] in "'\"`":
                cursor = _skip_string(source, cursor)
                continue
            if source[cursor] in "[{(":
                depth += 1
            elif source[cursor] in "]})":
                depth = max(0, depth - 1)
            elif source[cursor] == "," and depth == 0:
                cursor += 1
                break
            cursor += 1
    return values


def _field_values(source: str, names):
    """Collect static string fields and arrays from an authored JS object."""
    values = []
    for name, colon in _iter_properties(source, names):
        start = _skip_space_and_comments(source, colon + 1)
        if start < len(source) and source[start] == "[":
            values.extend(_array_values(source, start))
        else:
            value, first = _static_string(source, start)
            if value:
                values.append((value, source.count("\n", 0, first) + 1))
    return values


def _add(found, text, rel, line):
    text = normalize(text)
    if not text:
        return
    found.setdefault(text, {"text": text, "sources": []})["sources"].append(
        f"{rel}:{line}"
    )


def collect():
    found = {}

    tutorial = SRC / "scenes" / "tutorial.js"
    source = tutorial.read_text(encoding="utf-8")
    # `of` pages are state-dependent; their rendered text has no single stable
    # asset. The static head/sub/lines pages are exact manifest candidates.
    for text, line in _field_values(source, {"head", "sub", "lines"}):
        _add(found, text, tutorial.relative_to(ROOT).as_posix(), line)

    rest = SRC / "scenes" / "rest.js"
    source = rest.read_text(encoding="utf-8")
    begin, end = source.index("const COMPANION_TALK"), source.index("const FORT_SVG")
    for match in re.finditer(r":\s*\[", source[begin:end]):
        offset = begin + match.end() - 1
        for text, line in _array_values(source, offset):
            _add(found, text, rest.relative_to(ROOT).as_posix(), line)

    shop = SRC / "scenes" / "shop.js"
    source = shop.read_text(encoding="utf-8")
    begin, end = source.index("const GREETING"), source.index("const MOTH_SVG")
    # These are all authored shop voice lines; the SVG starts immediately
    # after the last one and is intentionally outside the scan.
    for match in re.finditer(r"const (?:GREETING|ON_BUY|ON_BROKE)\s*=\s*\[", source[begin:end]):
        offset = begin + match.end() - 1
        for text, line in _array_values(source, offset):
            _add(found, text, shop.relative_to(ROOT).as_posix(), line)

    events = SRC / "data" / "events.js"
    source = events.read_text(encoding="utf-8")
    for _, colon in _iter_properties(source, {"text"}):
        start = _skip_space_and_comments(source, colon + 1)
        if start < len(source) and source[start] == "[":
            values = _array_values(source, start)
        else:
            value, first = _static_string(source, start)
            values = [(value, source.count("\n", 0, first) + 1)] if value else []
        for text, line in values:
            _add(found, text, events.relative_to(ROOT).as_posix(), line)

    return sorted(found.values(), key=lambda item: item["text"])


def load_manifest():
    if not MANIFEST.exists():
        return {"version": 1, "provider": "elevenlabs", "entries": []}
    try:
        value = json.loads(MANIFEST.read_text(encoding="utf-8"))
        if isinstance(value, dict) and isinstance(value.get("entries"), list):
            return value
    except (OSError, json.JSONDecodeError):
        pass
    return {"version": 1, "provider": "elevenlabs", "entries": []}


def save_manifest(manifest):
    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def synthesize(api_key: str, voice_id: str, model_id: str, output_format: str, text: str) -> bytes:
    url = API.format(voice_id=voice_id) + "?output_format=" + output_format
    body = json.dumps({"text": text, "model_id": model_id}).encode("utf-8")
    request = Request(url, data=body, method="POST", headers={
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
        "User-Agent": "midnight-menagerie-voiceover-builder/1",
    })
    for attempt in range(4):
        try:
            with urlopen(request, timeout=120) as response:
                data = response.read()
                if not data:
                    raise RuntimeError("ElevenLabs returned an empty response")
                return data
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                detail = error.read().decode("utf-8", "replace")[:500]
                raise RuntimeError(f"ElevenLabs HTTP {error.code}: {detail}") from error
            time.sleep(min(12, 2 ** attempt))
        except (URLError, TimeoutError) as error:
            if attempt == 3:
                raise RuntimeError(f"ElevenLabs request failed: {error}") from error
            time.sleep(min(12, 2 ** attempt))
    raise RuntimeError("unreachable")


def main() -> int:
    load_env_file()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--voice-id", default=os.getenv("ELEVENLABS_VOICE_ID"))
    parser.add_argument("--model-id", default="eleven_multilingual_v2")
    parser.add_argument("--output-format", default="mp3_44100_128")
    parser.add_argument("--limit", type=int, default=0, help="generate only the first N missing lines")
    parser.add_argument("--force", action="store_true", help="regenerate existing MP3 files")
    parser.add_argument("--dry-run", action="store_true", help="list work without calling ElevenLabs")
    args = parser.parse_args()

    lines = collect()
    print(f"Found {len(lines)} static story narration lines.")
    if args.dry_run:
        for item in lines:
            print(f"  {narration_id(item['text'])}: {item['text']}")
        return 0

    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        print("ELEVENLABS_API_KEY is required (use --dry-run to inspect the batch).", file=sys.stderr)
        return 2
    if not args.voice_id:
        print("ELEVENLABS_VOICE_ID is required.", file=sys.stderr)
        return 2

    manifest = load_manifest()
    by_id = {str(entry.get("id")): entry for entry in manifest["entries"] if entry.get("id")}
    generated = 0
    for item in lines:
        ident = narration_id(item["text"])
        filename = ident + ".mp3"
        target = OUT / filename
        if target.exists() and not args.force:
            by_id[ident] = {"id": ident, "text": item["text"], "file": filename,
                            "sources": item["sources"], "voice_id": args.voice_id,
                            "model_id": args.model_id}
            continue
        if args.limit and generated >= args.limit:
            break
        print(f"  generating {ident}: {item['text']}")
        data = synthesize(os.getenv("ELEVENLABS_API_KEY", ""), args.voice_id,
                          args.model_id, args.output_format, item["text"])
        OUT.mkdir(parents=True, exist_ok=True)
        target.with_suffix(".mp3.part").write_bytes(data)
        target.with_suffix(".mp3.part").replace(target)
        by_id[ident] = {"id": ident, "text": item["text"], "file": filename,
                        "sources": item["sources"], "voice_id": args.voice_id,
                        "model_id": args.model_id}
        generated += 1
        save_manifest({"version": 1, "provider": "elevenlabs", "voice_id": args.voice_id,
                       "model_id": args.model_id, "output_format": args.output_format,
                       "entries": sorted(by_id.values(), key=lambda entry: entry["id"])})

    save_manifest({"version": 1, "provider": "elevenlabs", "voice_id": args.voice_id,
                   "model_id": args.model_id, "output_format": args.output_format,
                   "entries": sorted(by_id.values(), key=lambda entry: entry["id"])})
    print(f"Stored {generated} new MP3 files in {OUT.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
