// Shared rows for tools/calldata-bytes.mjs, tools/probe-calldata.mjs and tests.
export const ID = "f".repeat(64);
export const WALLET = "0x" + "1".repeat(40);

// Every agreement text of the test cases (each pair shares its surface).
export const CASES = {
  A1: "Our liability is limited to the agreed sum in total.",
  A2: "Across all claims together, we will not pay more than the agreed sum.",
  A3: "The agreed sum is the most we will ever pay under this arrangement.",
  A4: "Once the agreed sum has been paid out, nothing further is payable.",
  A5: "Every payment we make is taken from one agreed sum.",
  P1: "Our liability is limited to the agreed sum for each incident.",
  P2: "For any one claim, we will not pay more than the agreed sum.",
  P3: "The agreed sum is the most we will pay on any single occasion.",
  P4: "Each new incident starts again from the full agreed sum.",
  P5: "Every claim is measured on its own against the agreed sum.",
};

/** HARD BLOCK: any of these over 255 bytes stops the release. */
export function hardBlockRows() {
  const rows = Object.entries(CASES).map(([name, text]) => ({ name: `open_cap ${name}`, method: "open_cap", args: [WALLET, "the Claimant", 10000n, text] }));
  rows.push({ name: "accept_cap (id, text hash)", method: "accept_cap", args: [ID, ID] });
  rows.push({ name: "decline_cap (id)", method: "decline_cap", args: [ID] });
  rows.push({ name: "record_claim (max amount, 60-character note)", method: "record_claim", args: [ID, 10n ** 18n, "n".repeat(60)] });
  rows.push({ name: "confirm_claim (id, 20)", method: "confirm_claim", args: [ID, 20] });
  rows.push({ name: "reject_claim (id, 20, 60-character note)", method: "reject_claim", args: [ID, 20, "n".repeat(60)] });
  return rows;
}

/** MEASURE ONLY: the contract allows 600-character texts; calldata allows far fewer. */
export function measureOnlyRows() {
  return [{ name: "open_cap with a 600-character text (the contract cap)", method: "open_cap", args: [WALLET, "the Claimant", 10000n, "t".repeat(600)] }];
}
