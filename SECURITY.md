# SECURITY

## No funds

The contract holds no GEN and moves none; every write sends value 0. "Payable" is a ledger number.

## Trust model: no operative fact from one side alone

- **The agreement text, the ceiling and the claimant wallet** are proposed by the author, but nothing is active until
  the named claimant calls `accept_cap` with the keccak256 of the exact normalized text. A different text, or another
  wallet, cannot activate the cap. The claimant can decline instead.
- **The reading** (POOL or FRESH) comes from validators at `open_cap`, is shown to the claimant before acceptance, and is
  frozen: neither party can change it afterwards.
- **A claim** is recorded by the claimant but draws nothing until the author confirms it; the payable amount is computed
  at confirmation from the frozen scope. The author can reject it with a note instead. Each claim is decided once.
- The claimant cannot confirm their own claim and the author cannot accept for the claimant (tested).

## Fail-safe

Unusable or unresolved output reads PER_EVENT (FRESH): a lifetime pool is never drawn down on a guess.

## Prompt fence

The label and the text sit inside their own `<UNTRUSTED_…>` tags; the four tags and both labels are refused in any
letter case on input and stripped to a fixed point inside the prompt. The model never sees a wallet, an amount, a claim
or a state.

## Frontend

- No MetaMask Snap: the app switches the network with `wallet_switchEthereumChain` / `wallet_addEthereumChain`.
- One same-origin RPC proxy (`/genlayer-rpc`, in `vite.config.ts` and `vercel.json`).
- A write is reported only after the leader receipt says SUCCESS **and** consensus has reached ACCEPTED, and only after
  the reloaded state shows the change; otherwise "confirmation delayed" with a Check again button that re-reads state.
- *Accept* sends the hash the app computes from the text it displays, and is disabled if that hash differs from the one
  stored, or until the claimant ticks that they have read the text.
- Every revert predictable from state disables the button with the contract's own sentence.

## Remaining limits

See "Honest limitation" in the README.
