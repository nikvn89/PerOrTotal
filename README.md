# PerOrTotal

PerOrTotal makes one semantic difference visible: does a stated ceiling mean one shared pool, or a fresh limit for every event?

GenLayer validators classify the submitted agreement text once through the deployed `CapScope` contract:

- `AGGREGATE` becomes `POOL`: earlier claims reduce the remaining ceiling.
- `PER_EVENT` becomes `FRESH`: every claim starts from the full ceiling.

For a ceiling of `10000`, two claims of `6000` become `6000 + 4000` under `POOL`, but `6000 + 6000` under `FRESH`.

**No funds are held or transferred.** “Recorded” and “payable” are immutable ledger numbers, not payments.

## Project deployment

- Network: GenLayer StudioNet, chain `61999`
- Contract: `0x3579A82696B64bAB406341A500e23977172d5a6C`
- Deploy transaction: `0x9845285621b651850a900c7806e79487c950c0fac4db7e66bce2602b8e38abcd`
- Deployment result: `FINALIZED / SUCCESS`
- Frozen contract source SHA-256: `d5cd66fb6d945e56e24540e0b72ca41887ad873bcc3d7b2ed760e6ee258db4ae`

This address is separate from the CapScope Intelligent Contract submission address.

## Run locally

```bash
npm ci
npm run dev
```

Open the local URL shown by Vite. The development server proxies `/api/rpc` to the StudioNet RPC endpoint.

## Production build

```bash
npm test
npm run build
```

The Vercel deployment needs no secret. `VITE_CONTRACT_ADDRESS` is optional because the verified Project address is frozen as the safe default; setting the environment variable overrides it.

## Important user flow

1. Connect the author wallet and open a cap using a different claimant wallet.
2. Copy the computed Cap ID and wait until accepted state loads.
3. Switch to the declared claimant wallet to record claims.
4. Switch back to the author only when adding a dispute note.

The interface does not predict the validator verdict. It reads accepted contract state, displays the contract's `POOL` or `FRESH` result, and locally previews only deterministic payable arithmetic from that state.

## Safety boundaries

- Forms start empty; no demo agreement is silently submitted.
- The UI rejects same-wallet author/claimant use, malformed inputs, duplicate Cap IDs, oversized calldata, wrong-role writes, exhausted pools, and duplicate disputes before opening the wallet.
- A submitted transaction is not reported as successful until accepted state shows the expected postcondition.
- If confirmation is delayed, the UI tells the user to refresh known state instead of resubmitting.
- Claim occurrence is self-reported. A dispute note is immutable metadata and never changes the frozen payable value.

Detailed automated and wallet testing instructions are in `TESTING.md`.
