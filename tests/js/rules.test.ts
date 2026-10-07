// Every predictable revert, in the contract's own order, with its exact sentence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  acceptBlock, claimBlock, confirmBlock, declineBlock, openBlock, previewPayable, rejectBlock, RESERVED_TOKENS, REVERTS, UI,
} from "../../src/lib/rules.ts";
import { A, C, cap, claim, S, TEXT } from "./fixture.ts";

const contract = readFileSync(new URL("../../contracts/CapAccord.py", import.meta.url), "utf8");

test("every revert sentence is the contract's own, and every contract revert is mirrored", () => {
  const inContract = [...contract.matchAll(/UserError\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(Object.values(REVERTS))].sort(), [...new Set(inContract)].sort());
});

test("reserved tokens equal the contract's", () => {
  for (const t of RESERVED_TOKENS) assert.ok(contract.includes(`"${t}"`), t);
});

test("open_cap: wallet -> label -> text -> reserved -> amount -> not the author -> exists -> bytes", () => {
  const ok = { me: A, claimant: C, label: "the Claimant", amount: "10000", text: TEXT, exists: false, bytes: 150 };
  assert.equal(openBlock(ok), null);
  assert.equal(openBlock({ ...ok, me: "" }), UI.noWallet);
  assert.equal(openBlock({ ...ok, claimant: "0x12" }), REVERTS.invalidWallet);
  assert.equal(openBlock({ ...ok, claimant: "0x" + "0".repeat(40) }), REVERTS.invalidWallet);
  assert.equal(openBlock({ ...ok, label: "  " }), REVERTS.labelEmpty);
  assert.equal(openBlock({ ...ok, label: "l".repeat(81) }), REVERTS.labelTooLong);
  assert.equal(openBlock({ ...ok, text: "" }), REVERTS.textEmpty);
  assert.equal(openBlock({ ...ok, text: "t".repeat(601) }), REVERTS.textTooLong);
  assert.equal(openBlock({ ...ok, text: "it is per_event" }), REVERTS.reserved);
  assert.equal(openBlock({ ...ok, amount: "0" }), REVERTS.capRange);
  assert.equal(openBlock({ ...ok, amount: (10n ** 18n + 1n).toString() }), REVERTS.capRange);
  assert.equal(openBlock({ ...ok, claimant: A.toUpperCase().replace("0X", "0x") }), REVERTS.selfClaimant);
  assert.equal(openBlock({ ...ok, exists: true }), REVERTS.exists);
  assert.equal(openBlock({ ...ok, bytes: 256 }), UI.tooManyBytes);
});

test("accept / decline: only the claimant, only while proposed, only the text shown", () => {
  const p = cap({ state: "PROPOSED" });
  assert.equal(acceptBlock(p, C, true), null);
  assert.equal(acceptBlock(p, C, false), UI.notRead);
  assert.equal(acceptBlock(p, A, true), REVERTS.onlyClaimantAccept);
  assert.equal(acceptBlock(cap(), C, true), REVERTS.notAwaiting);
  assert.equal(acceptBlock(cap({ state: "PROPOSED", text_hash: "0".repeat(64) }), C, true), REVERTS.mismatch);
  assert.equal(declineBlock(p, C), null);
  assert.equal(declineBlock(p, S), REVERTS.onlyClaimantAccept);
  assert.equal(declineBlock(cap({ state: "DECLINED" }), C), REVERTS.notAwaiting);
});

test("record_claim: note -> claimant -> active -> amount -> room -> not used up", () => {
  const c = cap();
  assert.equal(claimBlock(c, C, "6000", "first", 150), null);
  assert.equal(claimBlock(c, C, "6000", "", 150), REVERTS.noteEmpty);
  assert.equal(claimBlock(c, C, "6000", "n".repeat(61), 150), REVERTS.noteTooLong);
  assert.equal(claimBlock(c, A, "6000", "first", 150), REVERTS.onlyClaimantClaim);
  assert.equal(claimBlock(cap({ state: "PROPOSED" }), C, "6000", "first", 150), REVERTS.notActive);
  assert.equal(claimBlock(c, C, "0", "first", 150), REVERTS.claimRange);
  assert.equal(claimBlock(cap({ claim_count: 20 }), C, "1", "x", 150), REVERTS.noRoom);
  assert.equal(claimBlock(cap({ remaining: "0", used: "10000" }), C, "1", "x", 150), REVERTS.usedUp);
  assert.equal(claimBlock(c, C, "1", "x", 300), UI.tooManyBytes);
});

test("confirm / reject: only the author, only pending claims; a used-up pool cannot be confirmed", () => {
  const c = cap({ claim_count: 1, pending_count: 1 });
  assert.equal(confirmBlock(c, claim(), A), null);
  assert.equal(confirmBlock(c, claim(), C), REVERTS.onlyAuthor, "the claimant cannot confirm their own claim");
  assert.equal(confirmBlock(c, claim({ index: 2 }), A), REVERTS.noSuchClaim);
  assert.equal(confirmBlock(c, claim({ state: "REJECTED" }), A), REVERTS.notPending);
  assert.equal(confirmBlock(c, claim({ payable_if_confirmed_now: "0" }), A), REVERTS.usedUp);
  assert.equal(rejectBlock(c, claim(), A, "Not covered"), null);
  assert.equal(rejectBlock(c, claim(), A, ""), REVERTS.noteEmpty);
  assert.equal(rejectBlock(c, claim(), C, "mine"), REVERTS.onlyAuthor);
  assert.equal(rejectBlock(c, claim({ state: "CONFIRMED" }), A, "late"), REVERTS.notPending);
});

test("the payable preview follows the frozen scope", () => {
  assert.equal(previewPayable(cap({ remaining: "4000", used: "6000" }), 6000n), 4000n);
  assert.equal(previewPayable(cap({ scope: "FRESH", remaining: "10000" }), 25000n), 10000n);
});
