# Changelog

## 2.0.0 — 2026-10-07

- **Two-party trust model** in response to review: the Project now runs `CapAccord`. The claimant must accept the exact
  agreement text (by its hash) and its reading before a cap is active, and each claim becomes payable only when the
  author confirms it (or is rejected with a note and draws nothing). The semantic core — rubric, fence, classifier,
  validator and fail-safe — is the CapScope Intelligent Contract's, verbatim. Deployed at `0x59846a597599BEdcDC43264b20D6BED8658709B0`.
- App rebuilt around the two-party flow: accept / decline with the text hash, claim form with the payable preview,
  confirm / reject on each pending claim.
- Run through the app on StudioNet (6 transactions, `RUNTIME_EVIDENCE.md`): propose → accept by text hash → two claims →
  one confirmed (6,000 payable), one rejected (nothing drawn).
- Tests: 56 Direct Mode contract tests (the real SDK), 25/25 mutants, 46 frontend tests, calldata table
  and RPC probe, source hash; CI.

## 1.0.0 — 2026-10-01

- First Project deployment `0x3579A82696B64bAB406341A500e23977172d5a6C` running CapScope: the author's text and the
  claimant's claims counted without the other party's confirmation.
