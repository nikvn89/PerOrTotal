// Calldata size of every write method, encoded exactly as genlayer-js 1.1.8 does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calldataBytes, CALLDATA_LIMIT } from "../../src/lib/calldata.ts";
import { CASES, hardBlockRows, WALLET } from "../../tools/calldata-rows.mjs";

test("ten case texts + every write at its cap stay under 255 bytes", () => {
  assert.equal(Object.keys(CASES).length, 10);
  for (const row of hardBlockRows()) {
    const n = calldataBytes(row.method, row.args);
    assert.ok(n <= CALLDATA_LIMIT, `${row.name}: ${n} bytes`);
  }
});

test("the 600-character contract cap is far past the calldata limit, so the meter must stop it", () => {
  assert.ok(calldataBytes("open_cap", [WALLET, "the Claimant", 10000n, "t".repeat(600)]) > CALLDATA_LIMIT);
});
