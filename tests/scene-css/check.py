"""Two scenes must never declare the same CSS class with conflicting layout.

Stylesheets are global and `ensureCss()` never unloads one, so a class collision between two
scenes is permanent for the session and produces zero console output.

This exact bug — `.rs-door` declared as an absolutely-positioned door panel in event.css and as
the Safe Room's choice button in rest.css — silently deleted every Safe Room from any run that
visited a Curiosity first. All healing and all card upgrading, gone, no error anywhere. It
survived three full playthrough reviews and made the balance simulator (which models rests
working) disagree with the actual game.

Two kinds of shared class exist here and only one is a bug:

  ERROR   the same class declared with conflicting LAYOUT properties in two scenes. One scene
          silently reformats the other. This is the .rs-door class of failure.
  note    the same class declared in several scenes with compatible properties — usually a
          shared component (.rm-* is the RoomScene base; .pf/.kidpf are ui/portrait.js). A
          maintenance smell worth lifting into ui/, but it does not break anything today.

Run:  python tests/scene-css/check.py
"""
import os
import re
import sys
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCENES = os.path.join(ROOT, "game", "src", "scenes")

ALLOW_PREFIXES = ("mm-", "is-", "has-", "sr-only", "scene")

# Properties that can silently reformat another scene's layout.
LAYOUT_PROPS = (
    "position", "display", "inset", "top", "right", "bottom", "left",
    "width", "height", "grid-template-columns", "grid-template-rows",
    "flex-direction", "transform", "z-index", "float",
)


def rules_in(path):
    """-> {class: [ {prop: value}, ... ]} for every rule that names the class."""
    css = open(path, encoding="utf-8").read()
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"@media[^{]*\{", "", css)
    out = collections.defaultdict(list)
    for m in re.finditer(r"([^{}@]+)\{([^{}]*)\}", css):
        sel, body = m.group(1), m.group(2)
        decls = {}
        for d in body.split(";"):
            if ":" in d:
                k, _, v = d.partition(":")
                k = k.strip().lower()
                if k in LAYOUT_PROPS:
                    decls[k] = v.strip().lower()
        for cls in set(re.findall(r"\.([A-Za-z_][\w-]*)", sel)):
            if not cls.startswith(ALLOW_PREFIXES):
                out[cls].append(decls)
    return out


def main():
    sheets = sorted(f for f in os.listdir(SCENES) if f.endswith(".css"))
    by_class = collections.defaultdict(dict)   # class -> {sheet: merged layout decls}
    for f in sheets:
        for cls, ruleset in rules_in(os.path.join(SCENES, f)).items():
            merged = {}
            for decls in ruleset:
                merged.update(decls)
            by_class[cls][f] = merged

    errors, notes = [], []
    for cls, per_sheet in sorted(by_class.items()):
        if len(per_sheet) < 2:
            continue
        conflicts = []
        for prop in LAYOUT_PROPS:
            vals = {f: d[prop] for f, d in per_sheet.items() if prop in d}
            if len(set(vals.values())) > 1:
                conflicts.append((prop, vals))
        (errors if conflicts else notes).append((cls, per_sheet, conflicts))

    for cls, per_sheet, conflicts in errors:
        print("  CONFLICT .%s  in %s" % (cls, ", ".join(sorted(per_sheet))), file=sys.stderr)
        for prop, vals in conflicts:
            for f, v in sorted(vals.items()):
                print("      %-24s %s: %s" % (prop, f, v), file=sys.stderr)

    if notes:
        print("  (%d classes shared across scenes with compatible layout — likely shared "
              "components, consider lifting into ui/: %s)"
              % (len(notes), ", ".join("." + c for c, _, _ in notes[:8])))

    print("RESULT: %d scene sheets, %d classes, %d conflicts"
          % (len(sheets), len(by_class), len(errors)))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
