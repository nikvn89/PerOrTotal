# RUNTIME_EVIDENCE

```
COMPILE PASS ≠ RUNTIME PASS
SUBMITTED ≠ ACCEPTED ≠ FINALIZED ≠ EXECUTION SUCCESS ≠ POSTCONDITION PASS
```

## Project run — CapAccord (address `0x59846a597599BEdcDC43264b20D6BED8658709B0`, through this app)

Deploy tx [`0xce80e6b4…37fe5fe6`](https://explorer-studio.genlayer.com/tx/0xce80e6b4c4504a5c5ab68e276cea166b9711b32fd8897c8a36b3fcad37fe5fe6) (FINALIZED, SUCCESS). The run through the app is recorded here once it has been made.

## Earlier deployment — CapScope (1.0.0, before the two-party model)

Contract `0x3579A82696B64bAB406341A500e23977172d5a6C`, deploy tx `0x9845285621b651850a900c7806e79487c950c0fac4db7e66bce2602b8e38abcd`.
Author `0x6276095FAEA15108740445ff277fdA8c304657F4`, claimant `0x037f58E33c1Ec8fdA272361E0aAC1e31054a1CDE`, cap
`9778c08b1662991ef14a6da7d4ab8c85c5ff3935f82814298a19da6d5746c952`. The same reading (AGGREGATE · POOL for "Every payment
we make is taken from one agreed sum.") and the same pool arithmetic, but claims counted on the claimant's word alone:



| Step | Asked | Recorded | Resulting remaining | UI result |
|---|---:|---:|---:|---|
| Open aggregate cap | — | — | `10000` | `AGGREGATE · POOL` |
| Claim 1 (`first`) | `6000` | `6000` | `4000` | `FULL` |
| Claim 2 (`second-over-cap`) | `6000` | `4000` | `0` | `CUT` |
| Further claim | `6000` preview | `0` | `0` | Blocked before wallet: `The cap has been used up` |
| Author dispute on claim 2 | — | remains `4000` | remains `0` | `Disputed: Not accepted` |
