// get_cap / get_claims views as the contract returns them.
import type { Cap, Claim } from "../../src/lib/types.ts";
import { capIdOf, textHashOf } from "../../src/lib/ids.ts";

export const A = "0x6276095faea15108740445ff277fda8c304657f4";
export const C = "0x037f58e33c1ec8fda272361e0aac1e31054a1cde";
export const S = "0x146e44881d35814ba582d265af5b97ef2695ec8e";
export const TEXT = "Every payment we make is taken from one agreed sum.";

export function cap(over: Partial<Cap> = {}): Cap {
  return {
    cap_id: capIdOf(A, TEXT), author: A, claimant_wallet: C, claimant_label: "the Claimant", text: TEXT, text_hash: textHashOf(TEXT),
    outcome: "AGGREGATE", scope: "POOL", state: "ACTIVE", cap_amount: "10000", used: "0", remaining: "10000", claim_count: 0,
    pending_count: 0, exhausted: false, ...over,
  };
}

export function claim(over: Partial<Claim> = {}): Claim {
  return {
    cap_id: capIdOf(A, TEXT), index: 1, amount: "6000", note: "first", state: "PENDING", payable: "0", payable_if_confirmed_now: "6000",
    reject_note: "", ...over,
  };
}
