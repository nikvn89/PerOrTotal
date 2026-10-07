// Postconditions checked AFTER the receipt says SUCCESS, against reloaded
// accepted state. A write is reported as done only when the state shows it.

import { normText, textHashOf } from "./ids.ts";
import { pyNormalize, pyStrip } from "./pytext.ts";
import type { Cap, Claim } from "./types.ts";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Proposed, mine, my terms; AGGREGATE is POOL and PER_EVENT is FRESH. */
export function openVerified(c: Cap | null, s: { id: string; me: string; claimant: string; label: string; amount: string; text: string }): boolean {
  if (!c || c.cap_id !== s.id || !same(c.author, s.me) || !same(c.claimant_wallet, pyStrip(s.claimant)) ||
      c.claimant_label !== pyNormalize(s.label) || c.text !== pyStrip(s.text) || c.cap_amount !== s.amount ||
      c.state !== "PROPOSED" || c.used !== "0" || c.claim_count !== 0 || c.text_hash !== textHashOf(s.text)) return false;
  return (c.outcome === "AGGREGATE" && c.scope === "POOL") || (c.outcome === "PER_EVENT" && c.scope === "FRESH");
}

export function acceptVerified(c: Cap | null, before: Cap): boolean {
  return !!c && c.state === "ACTIVE" && c.text_hash === before.text_hash && c.scope === before.scope && normText(c.text) === normText(before.text);
}

export function declineVerified(c: Cap | null): boolean {
  return !!c && c.state === "DECLINED";
}

/** One more claim, PENDING, nothing drawn yet. */
export function claimVerified(before: Cap, after: Cap | null, k: Claim | undefined, amount: string, note: string): boolean {
  return !!after && !!k && after.claim_count === before.claim_count + 1 && after.pending_count === before.pending_count + 1 &&
    after.used === before.used && k.index === after.claim_count && k.amount === amount && k.note === pyStrip(note) &&
    k.state === "PENDING" && k.payable === "0";
}

/** CONFIRMED with exactly the preview payable; POOL draws it down, FRESH keeps the full ceiling. */
export function confirmVerified(before: Cap, k0: Claim, after: Cap | null, k: Claim | undefined): boolean {
  if (!after || !k || k.state !== "CONFIRMED" || k.payable !== k0.payable_if_confirmed_now) return false;
  if (BigInt(after.used) !== BigInt(before.used) + BigInt(k.payable)) return false;
  return after.scope === "POOL" ? BigInt(after.remaining) === BigInt(before.remaining) - BigInt(k.payable) : after.remaining === after.cap_amount;
}

export function rejectVerified(before: Cap, after: Cap | null, k: Claim | undefined, note: string): boolean {
  return !!after && !!k && k.state === "REJECTED" && k.payable === "0" && k.reject_note === pyStrip(note) && after.used === before.used;
}
