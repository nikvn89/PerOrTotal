# PerOrTotal testing

## Automated checks

Run from the repository root:

```bash
npm ci
npm test
npm run build
npm run calldata
npm run verify:source
python3 CAPSCOPE_KILLSET_CHECK.py contracts/CapScope.py
```

The JavaScript tests cover POOL/FRESH payable behavior, wallet roles, exhausted pools, dispute permissions, duplicate-submit protection, Python-compatible text normalization, rollback extraction, and untrusted text escaping. The Python suite verifies the frozen Intelligent Contract source and state machine.

### Recorded result — 1 October 2026

| Check | Result |
|---|---|
| Frontend unit tests | PASS — 11/11 |
| Frozen contract tests | PASS — 37/37 |
| TypeScript and Vite production build | PASS |
| Contract source SHA-256 verification | PASS |
| GenVM calldata hard gate | PASS — 12/12 |
| Contract kill-set and rubric-overlap gate | PASS |

## Project deployment evidence

- Contract: `0x3579A82696B64bAB406341A500e23977172d5a6C`
- Deploy transaction: `0x9845285621b651850a900c7806e79487c950c0fac4db7e66bce2602b8e38abcd`
- Explorer result observed: `FINALIZED / SUCCESS`
- Author test wallet: `0x6276095FAEA15108740445ff277fdA8c304657F4`
- Claimant test wallet: `0x037f58E33c1Ec8fdA272361E0aAC1e31054a1CDE`
- Tested Cap ID: `9778c08b1662991ef14a6da7d4ab8c85c5ff3935f82814298a19da6d5746c952`

### Accepted-state wallet result — 1 October 2026

| Step | Asked | Recorded | Resulting remaining | UI result |
|---|---:|---:|---:|---|
| Open aggregate cap | — | — | `10000` | `AGGREGATE · POOL` |
| Claim 1 (`first`) | `6000` | `6000` | `4000` | `FULL` |
| Claim 2 (`second-over-cap`) | `6000` | `4000` | `0` | `CUT` |
| Further claim | `6000` preview | `0` | `0` | Blocked before wallet: `The cap has been used up` |
| Author dispute on claim 2 | — | remains `4000` | remains `0` | `Disputed: Not accepted` |

This confirms that accepted on-chain state remembers earlier claims, cuts the second claim at the shared ceiling, blocks any further write after exhaustion, and keeps the frozen payable amount unchanged when the author adds dispute metadata.

## Important wallet test only

The simple validation rules are covered automatically. Manually verify only the end-to-end wallet and accepted-state path.

### Part 1 — open one POOL cap

1. Open the deployed site and connect the author wallet `0x6276095FAEA15108740445ff277fdA8c304657F4`.
2. Enter claimant wallet `0x037f58E33c1Ec8fdA272361E0aAC1e31054a1CDE`, label `the Claimant`, ceiling `10000`, and exact text `Every payment we make is taken from one agreed sum.`
3. Press **Open cap**, approve the wallet transaction once, and wait. Expected: the notice says the cap was accepted, the loaded state shows `AGGREGATE · POOL`, and remaining is `10000`.

Do not press **Open cap** again if a transaction hash already appeared. Use **Refresh** or load the displayed Cap ID.

### Part 2 — prove the shared pool remembers

1. Switch MetaMask to claimant wallet `0x037f58E33c1Ec8fdA272361E0aAC1e31054a1CDE`.
2. Record `6000` with note `first`; after accepted state, confirm recorded is `6000` and remaining is `4000`.
3. Record `6000` with note `second-over-cap`; after accepted state, confirm recorded is `4000`, remaining is `0`, and the pool is exhausted.

### Part 3 — prove author-only dispute metadata

1. Switch MetaMask back to author wallet `0x6276095FAEA15108740445ff277fdA8c304657F4`.
2. On claim 2, enter dispute note `Not accepted` and press **Dispute** once.
3. After accepted state reloads, confirm the dispute note appears while claim 2 payable remains `4000`.

## Pass conditions

- The site opens the project-specific explorer address.
- Every write returns a transaction hash and later reloads accepted state.
- The claimant can record; the author cannot record.
- The author can dispute; the claimant cannot dispute.
- The second POOL claim is cut from `6000` to `4000`.
- The dispute note does not alter payable, used, or remaining values.

These checks validate the Project deployment and frontend integration. The separate CapScope Intelligent Contract submission has its own address and evidence.
