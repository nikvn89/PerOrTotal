// Postconditions: a write is reported as done only when the reloaded state shows it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { capIdOf } from "../../src/lib/ids.ts";
import { acceptVerified, claimVerified, confirmVerified, declineVerified, openVerified, rejectVerified } from "../../src/lib/verify.ts";
import { A, C, cap, claim, TEXT } from "./fixture.ts";

test("propose: mine, my terms, PROPOSED; the verdict and the scope agree", () => {
  const s = { id: capIdOf(A, TEXT), me: A, claimant: C, label: " the  Claimant ", amount: "10000", text: `  ${TEXT} ` };
  assert.ok(openVerified(cap({ state: "PROPOSED" }), s));
  assert.ok(openVerified(cap({ state: "PROPOSED", outcome: "PER_EVENT", scope: "FRESH" }), s));
  assert.ok(!openVerified(cap({ state: "PROPOSED", outcome: "PER_EVENT", scope: "POOL" }), s));
  assert.ok(!openVerified(cap(), s), "already active is wrong");
  assert.ok(!openVerified(cap({ state: "PROPOSED", cap_amount: "9999" }), s));
});

test("accept and decline", () => {
  const p = cap({ state: "PROPOSED" });
  assert.ok(acceptVerified(cap(), p));
  assert.ok(!acceptVerified(cap({ scope: "FRESH" }), p));
  assert.ok(declineVerified(cap({ state: "DECLINED" })));
});

test("a recorded claim is pending and draws nothing", () => {
  const before = cap();
  const after = cap({ claim_count: 1, pending_count: 1 });
  assert.ok(claimVerified(before, after, claim(), "6000", " first "));
  assert.ok(!claimVerified(before, cap({ claim_count: 1, pending_count: 1, used: "6000" }), claim(), "6000", "first"));
});

test("confirm: POOL draws down by the preview; FRESH keeps the full ceiling", () => {
  const before = cap({ claim_count: 2, pending_count: 1, used: "6000", remaining: "4000" });
  const k0 = claim({ index: 2, payable_if_confirmed_now: "4000" });
  assert.ok(confirmVerified(before, k0, cap({ claim_count: 2, used: "10000", remaining: "0" }), claim({ index: 2, state: "CONFIRMED", payable: "4000" })));
  assert.ok(!confirmVerified(before, k0, cap({ claim_count: 2, used: "12000", remaining: "0" }), claim({ index: 2, state: "CONFIRMED", payable: "6000" })));
  const f = cap({ scope: "FRESH", claim_count: 1, pending_count: 1 });
  assert.ok(confirmVerified(f, claim(), cap({ scope: "FRESH", used: "6000", remaining: "10000" }), claim({ state: "CONFIRMED", payable: "6000" })));
});

test("reject: no draw, note kept", () => {
  const before = cap({ claim_count: 1, pending_count: 1 });
  assert.ok(rejectVerified(before, cap({ claim_count: 1 }), claim({ state: "REJECTED", reject_note: "Not covered" }), "Not covered"));
  assert.ok(!rejectVerified(before, cap({ claim_count: 1, used: "6000" }), claim({ state: "REJECTED", reject_note: "Not covered" }), "Not covered"));
});
