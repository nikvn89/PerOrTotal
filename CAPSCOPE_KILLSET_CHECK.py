"""
Kill-set + rubric gate for CapScope (project PerOrTotal).

GATE 1  no token or bigram may separate the two classes.
GATE 2  the rubric may share no content word with any case.
        (No stemming: 'pay' and 'paid' look different to it, so a green gate
         still needs a human read of the rubric.)

Run:  python3 CAPSCOPE_KILLSET_CHECK.py
      python3 CAPSCOPE_KILLSET_CHECK.py contracts/CapScope.py
"""

import re
import sys

DECLARED = 'the Claimant; a ceiling amount of 10000'

CASES = {
    "AGGREGATE": {
        "A1": "Our liability is limited to the agreed sum in total.",
        "A2": "Across all claims together, we will not pay more than the agreed sum.",
        "A3": "The agreed sum is the most we will ever pay under this arrangement.",
        "A4": "Once the agreed sum has been paid out, nothing further is payable.",
        "A5": "Every payment we make is taken from one agreed sum."
    },
    "PER_EVENT": {
        "P1": "Our liability is limited to the agreed sum for each incident.",
        "P2": "For any one claim, we will not pay more than the agreed sum.",
        "P3": "The agreed sum is the most we will pay on any single occasion.",
        "P4": "Each new incident starts again from the full agreed sum.",
        "P5": "Every claim is measured on its own against the agreed sum."
    }
}

PAIRS = [
    ["A2", "P2", "same sentence apart from the opening phrase"],
    ["A3", "P3", "both name the most that will be paid"],
    ["A1", "P1", "same sentence, different closing phrase"],
    ["A5", "P5", "both open with Every"],
    ["A4", "P4", "both describe what happens after a payment"],
]

MUST_REVERT = {}


def features(text):
    tok = re.findall(r"[a-z]+", text.lower())
    f = set(tok)
    f.update(" ".join(p) for p in zip(tok, tok[1:]))
    return f


def leaks(case_set):
    sides = {k: {n: features(t) for n, t in v.items()} for k, v in case_set.items()}
    names = list(sides)
    out = []
    for i, name in enumerate(names):
        other = names[1 - i]
        common = set.intersection(*sides[name].values())
        absent = set().union(*sides[other].values())
        out += [(name, f) for f in sorted(common - absent)]
    return out


STOP = set("""a an and are as at be been by do does for from has have in into is it its
of on or our that the their them there these this to us we will with your you not no
if any each one two both same other than then when where which while who whom what""".split())


def content_words(text):
    return {w for w in re.findall(r"[a-z]+", text.lower())
            if w not in STOP and len(w) > 2}


flat = {}
for group in CASES.values():
    flat.update(group)

all_texts = dict(flat)
all_texts.update(MUST_REVERT)

print("=" * 74)
print("DECLARED CONTEXT:", DECLARED)
print("=" * 74)

found = leaks(CASES)
if found:
    print(f"LEAK: {len(found)} separating feature(s) — set is NOT usable:")
    for side, f in found:
        print(f"   {f!r:32s} -> in ALL {side}, in NO case of the other class")
else:
    print("NO LEAK: no token or bigram separates the two classes.")

print()
print("Adversarial pairs (same surface, opposite label):")
for a, b, why in PAIRS:
    print(f"   {a} / {b}  - {why}")

print()
if MUST_REVERT:
    print()
    print("Must-REVERT texts (not in gate 1; the open method must raise on each):")
    for n, t in sorted(MUST_REVERT.items()):
        print(f"   {n}  {t}")

print()
print("Byte length per case (255-byte calldata cliff; method name + 64-hex id add more):")
for name, text in sorted(all_texts.items()):
    n = len(text.encode("utf-8"))
    print(f"   {name}  {n:3d} bytes{'   <-- CHECK' if n > 150 else ''}")


def rubric_text(path):
    src = open(path, encoding="utf-8").read()
    if path.endswith(".txt"):
        return src
    m = re.search(r'RUBRIC\s*=\s*f?"""(.*?)"""', src, re.S)
    return m.group(1) if m else None


def rubric_overlap(path):
    body = rubric_text(path)
    if body is None:
        print("\ncould not find a RUBRIC block in", path)
        return 1
    cw = set()
    for t in all_texts.values():
        cw |= content_words(t)
    ov = sorted(content_words(body) & cw)
    print()
    print("=" * 74)
    print("RUBRIC OVERLAP GATE —", path)
    print("=" * 74)
    if ov:
        print(f"FAIL: {len(ov)} content word(s) shared with the case set:")
        for w in ov:
            print("   ", w)
        print("The rubric defines the TASK. It never quotes an answer.")
        return 1
    print("PASS: rubric shares no content word with any case.")
    print("      (No stemming — read the rubric yourself for near-matches.)")
    return 0


print("=" * 74)
if len(sys.argv) > 1:
    sys.exit((1 if found else 0) or rubric_overlap(sys.argv[1]))
sys.exit(1 if found else 0)
