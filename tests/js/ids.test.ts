import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capIdOf, fmt, idsFromInput, textHashOf } from "../../src/lib/ids.ts";

const v = JSON.parse(readFileSync(new URL("./id-vectors.json", import.meta.url), "utf8"));

test("cap ids and text hashes match the contract, including whitespace and Unicode", () => {
  assert.ok(v.caps.length >= 6);
  for (const row of v.caps) {
    assert.equal(capIdOf(v.author, row.text), row.cap_id, JSON.stringify(row.text));
    assert.equal(textHashOf(row.text), row.text_hash, JSON.stringify(row.text));
  }
});

test("whitespace variants of a text share one hash (what the claimant signs)", () => {
  assert.equal(textHashOf("  One   agreed\tsum. "), textHashOf("One agreed sum."));
  assert.notEqual(textHashOf("One agreed sum."), textHashOf("One agreed sum"));
});

test("ids from links; amounts with separators", () => {
  const a = "a".repeat(64);
  assert.deepEqual(idsFromInput(`https://x.app/?c=${a}`), [a]);
  assert.deepEqual(idsFromInput(a + "b"), []);
  assert.equal(fmt("10000"), "10,000");
  assert.equal(fmt(10n ** 18n), "1,000,000,000,000,000,000");
});
