PerOrTotal does not judge whether a ceiling is fair, lawful or wise. It reads one thing in the agreed words — one pool used up over time, or a fresh limit for every claim — and no fact behind a payable number comes from one party alone.

<p align="center"><img src="logo.png" alt="PerOrTotal" width="140"></p>

# PerOrTotal

A two-party ceiling ledger on GenLayer StudioNet (chain 61999) · py-genlayer v0.2. Contract: `CapAccord`.

**No funds are held or moved.** "Payable" is a ledger number agreed by both parties, not a payment.

| | |
|---|---|
| Contract source | `contracts/CapAccord.py` (SHA-256 in `SOURCE_SHA256.txt`) |
| Project deployment | [`0x59846a597599BEdcDC43264b20D6BED8658709B0`](https://explorer-studio.genlayer.com/address/0x59846a597599BEdcDC43264b20D6BED8658709B0) |
| Evidence | `RUNTIME_EVIDENCE.md` (one tx hash per row) · `TESTING.md` |
| Semantic core | the CapScope Intelligent Contract's rubric, fence, classifier and fail-safe, verbatim |

## What it does

The author proposes a ceiling, the claimant's wallet and the words that set the ceiling. GenLayer validators read the
words **once**:

| Reading | Scope | Two confirmed claims of 6,000 against 10,000 |
|---|---|---|
| `AGGREGATE` | **POOL** — earlier claims leave less for later | 6,000 + 4,000 |
| `PER_EVENT` | **FRESH** — every claim starts from the full ceiling | 6,000 + 6,000 |

Unresolved readings count as PER_EVENT, so a pool is never drawn down on a guess.

## Trust model — no operative fact from one side alone

| Fact | Comes from | Counts only when |
|---|---|---|
| ceiling, claimant wallet, agreement text | the author | the claimant **accepts** — signing the keccak256 of the exact text they read, together with its frozen reading — or the cap stays inactive; the claimant can decline |
| POOL or FRESH | validators, at proposal | shown before acceptance, frozen after |
| a claim (amount, what happened) | the claimant | the author **confirms** it — the payable amount is computed then from the frozen scope — or rejects it with a note, and it draws nothing |

The claimant cannot confirm their own claim, the author cannot accept for the claimant, and each claim is decided once.
What remains unverifiable is stated in "Honest limitation" below.

## What the app shows

- **Overview**: the reading and the two-party flow.
- **Caps**: the agreement text in full with its hash, the reading (AGGREGATE · POOL or PER_EVENT · FRESH), the state
  (PROPOSED, ACTIVE or DECLINED), author and claimant, the ceiling, what remains, confirmed payable and pending claims.
  For the claimant of a proposed cap: a box to tick after reading, *Accept text and reading* (which sends the hash of the
  text on screen) and *Decline*. For the claimant of an active cap: a claim form with the payable amount if confirmed now.
  For the author: *Confirm* or *Reject* (with a note) on each pending claim. Buttons a wallet may not use are disabled
  with the contract's own sentence.
- **Propose a cap**: claimant wallet, label, ceiling and text, with the cap id and the text hash the claimant will sign.
- **Verification**: contract address, source SHA-256, the rubric hash and the two-party rules read from `get_limits`.

After every write the app waits for consensus to accept it, re-reads the cap and its claims, and only then reports what
happened.

## How to try it

You need **two wallets** on GenLayer StudioNet: an author and a claimant. Only fees are spent.

1. **Author** — *Propose a cap*: the claimant's wallet, label `the Claimant`, ceiling `10000`, text
   `Every payment we make is taken from one agreed sum.` → AGGREGATE · POOL, PROPOSED. Copy the cap link.
2. **Claimant** — open the link: tick the box and *Accept text and reading*. Record two claims of `6000`.
3. **Author** — *Confirm* claim 1 (payable 6,000), then claim 2 (payable 4,000 — the pool is used up). Or *Reject* one
   with a note: it draws nothing.

## Methods

| Write | Who | Checks, in order |
|---|---|---|
| `open_cap(claimant_wallet, claimant_label, cap_amount, text)` | anyone (becomes the author) | wallet → label → text → no reserved token → amount → not the author → not opened before → **the only model call** |
| `accept_cap(cap_id, text_hash)` | the claimant | claimant → PROPOSED → hash of the stored text |
| `decline_cap(cap_id)` | the claimant | claimant → PROPOSED |
| `record_claim(cap_id, amount, note)` | the claimant | note → claimant → ACTIVE → amount → fewer than 20 claims → not used up |
| `confirm_claim(cap_id, index)` | the author | author → claim exists → PENDING → something payable |
| `reject_claim(cap_id, index, note)` | the author | note → author → claim exists → PENDING |

Views return JSON strings with amounts as decimal strings: `get_cap`, `get_claim`, `get_claims`, `get_rubric`,
`get_limits`. The full specification is in `LOCKED_SPEC.md`.

## Run locally

```bash
npm ci
npm run dev            # http://localhost:5173 (the /genlayer-rpc proxy is in vite.config.ts)
npm run build && npm test
npm run verify:source
python3 -m pytest tests/contract -q -p no:cacheprovider   # needs genlayer-test 0.29.2
```

`VITE_CONTRACT_0x59846a597599BEdcDC43264b20D6BED8658709B0ESS` overrides the deployment address. On Vercel, `vercel.json` declares the same proxy.

## Honest limitation

1. **Consent, not truth.** Both parties agreeing to a claim does not prove the event happened; it proves neither party
   recorded a payable number on its own.
2. **The author can refuse.** A rejected claim is recorded with the author's note; the contract does not decide who is
   right about the event.
3. **The reading is the only judgement made.** Validators decide POOL or FRESH from the words; they do not judge whether
   the ceiling is fair or lawful.
4. **Text length.** The contract accepts 600 characters, but the 255-byte calldata limit allows about 159 ASCII
   characters; the byte meter stops longer texts.

License: MIT.
