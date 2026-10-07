// Offline calldata size table (no network, no wallet).
// Encodes exactly like genlayer-js 1.1.8 writeContract and counts bytes.
//   node tools/calldata-bytes.mjs            -> table, rc 1 if a HARD BLOCK row is over 255
import { abi } from "genlayer-js";
import { hardBlockRows, measureOnlyRows, ID } from "./calldata-rows.mjs";

const LIMIT = 255;
const bytes = (method, args) => {
  const enc = abi.calldata.encode(abi.calldata.makeCalldataObject(method, args, undefined));
  return (abi.transactions.serialize([enc, false]).length - 2) / 2;
};

let failed = 0;
console.log("HARD BLOCK (must be <= 255 bytes)");
for (const r of hardBlockRows()) {
  const n = bytes(r.method, r.args);
  if (n > LIMIT) failed += 1;
  console.log(`  ${n > LIMIT ? "OVER" : "ok  "}  ${String(n).padStart(4)}  ${r.name}`);
}
console.log("\nMEASURE ONLY (contract cap wider than the proven path)");
for (const r of measureOnlyRows()) {
  const n = bytes(r.method, r.args);
  console.log(`  ${n > LIMIT ? "over" : "ok  "}  ${String(n).padStart(4)}  ${r.name}`);
}
let maxT = 0;
for (let len = 1; len <= 600; len += 1) if (bytes("open_cap", ["0x" + "1".repeat(40), "the Claimant", 10n ** 18n, "x".repeat(len)]) <= LIMIT) maxT = len;
console.log(`\nLongest ASCII agreement text that fits (12-character label, max ceiling): ${maxT} characters (contract cap 600)`);
console.log(failed ? `\nFAIL: ${failed} hard-block row(s) over ${LIMIT} bytes` : "\nPASS: every hard-block row fits");
process.exit(failed ? 1 : 0);
