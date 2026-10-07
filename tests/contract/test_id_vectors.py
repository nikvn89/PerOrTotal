"""
Golden cap-id and text-hash vectors shared with the frontend (tests/js/ids.test.ts
reads the same file). Every value is computed by the contract's own code on the real
SDK Keccak256.

Regenerate:  WRITE_VECTORS=1 python3 -m pytest tests/contract/test_id_vectors.py
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VECTORS = ROOT / "tests" / "js" / "id-vectors.json"
CONTRACT = str(ROOT / "contracts" / "CapAccord.py")

AUTHOR = "0x6276095FAEA15108740445ff277fdA8c304657F4"
TEXTS = [
    "Every payment we make is taken from one agreed sum.",
    "  Every claim is measured   on its own\tagainst the agreed sum. ",
    "Café　limit per event",
    "\u001cOne pool\u001f",
    "﻿Total cap 🧾",
    "Line one\u0085line two",
]


def build(contract):
    rows = []
    for t in TEXTS:
        n = contract._normalize_text(t.strip())
        rows.append({"text": t, "cap_id": contract._cap_id_for(AUTHOR.lower(), n), "text_hash": contract._hash_text(n)})
    return {"author": AUTHOR, "caps": rows}


def test_vectors_match_contract(direct_deploy):
    data = build(direct_deploy(CONTRACT))
    if os.environ.get("WRITE_VECTORS") == "1":
        VECTORS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    assert json.loads(VECTORS.read_text(encoding="utf-8")) == data
