# TESTING

```
COMPILE PASS ≠ RUNTIME PASS
SUBMITTED ≠ ACCEPTED ≠ FINALIZED ≠ EXECUTION SUCCESS ≠ POSTCONDITION PASS
```

## Automated gates (run before release; CI runs them on every push)

| Gate | Command | Result |
|---|---|---|
| Kill-set + rubric gate | `python3 CAPACCORD_KILLSET_CHECK.py contracts/CapAccord.py` | rc 0 — no word or word pair separates the classes; the rubric shares no content word with any case |
| genvm-linter | `python3 -m genvm_linter.cli lint contracts/CapAccord.py` | pass |
| Contract tests (Direct Mode: the real py-genlayer v0.2.16 SDK, model mocked) | `python3 -m pytest tests/contract -q -p no:cacheprovider` | 56 passed |
| Mutation check | `python3 tools/mutate.py .` | 25/25 deliberate faults caught |
| Frontend build | `npm run build` | rc 0 |
| Frontend tests | `npm test` | 46 passed |
| Source hash | `npm run verify:source` | `contracts/CapAccord.py` matches `SOURCE_SHA256.txt` |
| Calldata table | `node tools/calldata-bytes.mjs` | every write ≤ 255 bytes (largest: `record_claim` at the maximum amount and a 60-character note, 169) |
| Calldata on the RPC | `node tools/probe-calldata.mjs <address>` | runs in CI against the address in `deployments.json` |

The mocked model labels drive the deterministic code paths; they say nothing about what the real model returns. The
on-chain run does.

### What the mutation check catches

Each fault is applied to the contract alone and the suite must go red (`tests/mutations.py`): AGGREGATE not becoming
POOL, the pool not drawing down, FRESH not capped per claim, **a cap active without the claimant's acceptance**, **the
text hash ignored or not normalized**, **anyone allowed to accept**, a declined cap still acceptable, **claims allowed
before acceptance**, **a recorded claim drawing down before confirmation**, **anyone allowed to confirm or reject**, a
claim decided twice, confirmation not drawing down, rejection drawing down, the asked amount recorded instead of the
payable one, the pending count not updated, a used-up pool still taking claims, the claim cap off by one, the claimant
allowed to be the author, the fail-safe flipped, the validator accepting any label, the reserved-token check dropped,
the same cap opened twice, and the note cap off by one.

### Calldata

Encoded exactly as genlayer-js 1.1.8 `writeContract` does. The ten case texts measure 141–159 bytes as `open_cap` with
a 12-character label and a ceiling of 10000. The contract allows 600 characters of text, but only about 159 ASCII
characters fit in 255 bytes; the proposal form shows a byte meter and disables *Propose cap* above 255 bytes.

## Frontend checks

- **Revert sentences** (`tests/js/rules.test.ts`): the set in `src/lib/rules.ts` equals the 23 sentences in the source,
  and for every write the UI reports the earliest failing check in the source's order.
- **Ids and hashes** (`tests/js/ids.test.ts`): cap ids and text hashes equal to vectors produced by the contract on the
  real SDK (whitespace, Unicode); whitespace variants share one text hash.
- **Postconditions** (`tests/js/verify.test.ts`): a proposal is reported only when the cap is PROPOSED with the verdict
  and scope in agreement; an acceptance only when the cap is ACTIVE with the same hash and scope; a claim only when it is
  PENDING and drew nothing; a confirmation only when the payable equals the preview and the pool moved by exactly that.
- **Receipts** (`tests/js/receipt.test.ts`): a leader SUCCESS while validators are still proposing, committing or
  revealing is pending, not success.
- **Interface check** (Playwright against `vite preview`, the RPC mocked by decoding calldata): overview, a POOL cap seen
  by the author (Confirm / Reject) and by the claimant (claim form, typing key by key), a proposed cap seen by the
  claimant (read box, Accept, Decline) and by the author (refused with the contract's sentence), the proposal form with
  an existing cap, and 390 px — no page error, no horizontal scroll.

## On-chain run

See `RUNTIME_EVIDENCE.md`.

Project run through the app (6 transactions): the author proposed "Every payment we make is taken from one agreed sum."
with a 10,000 ceiling → **AGGREGATE · POOL**, PROPOSED; the claimant saw no claim form until accepting; the claimant
accepted the text by its hash; two claims of 6,000 were recorded and drew nothing while pending; the author confirmed
claim 1 (payable 6,000, 4,000 left) and rejected claim 2 with a note (payable 0). Every result was reported only after
the app re-read the state: **PASS**.

## Consensus behaviour

The model is called once per cap, in `open_cap`. Validators re-run the reading and must agree on the exact label; a
disagreement rotates the leader or ends the transaction without recording the cap. Every other write is deterministic.

## What this run does NOT prove

- That the events behind claims happened: confirmation is the author's consent, not evidence.
- Label stability across repeated runs or validator sets.
- Prompt-injection resistance beyond the fence and the reserved-token check; no adversarial model run is done.
