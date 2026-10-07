import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCap, parseClaims, parseLimits } from "../../src/lib/parse.ts";
import { cap, claim } from "./fixture.ts";

const CR = JSON.stringify(cap());
const KR = JSON.stringify({ cap_id: cap().cap_id, total: 1, claims: [claim()] });

test("views are parsed as JSON once, or twice when the RPC double-encodes them", () => {
  assert.equal(parseCap(CR)?.scope, "POOL");
  assert.equal(parseCap(JSON.stringify(CR))?.remaining, "10000");
  assert.equal(parseClaims(KR)?.[0].payable_if_confirmed_now, "6000");
  assert.deepEqual(parseLimits('{"two_party": {"author_confirms_each_claim": true}}')?.two_party, { author_confirms_each_claim: true });
});

test("unknown id, broken JSON or a wrong shape read as nothing", () => {
  assert.equal(parseCap("{}"), null);
  assert.equal(parseCap(CR.replace('"cap_amount":"10000"', '"cap_amount":10000')), null);
  assert.equal(parseClaims("{}"), null);
  assert.equal(parseClaims(KR.replace('"payable":"0"', '"payable":0')), null);
});
