// Mirrors every revert of contracts/CapAccord.py that can be predicted from state
// already read, in the SAME order the contract checks them. Whether the text means
// one pool or a fresh limit per event is NEVER decided here: only validators decide
// that, inside open_cap(). The verdict and the scope are read back from the view.

import { textHashOf } from "./ids.ts";
import { pyContainsToken, pyLen, pyNormalize, pyStrip } from "./pytext.ts";
import type { Cap, Claim } from "./types.ts";

export const MAX_TEXT_LENGTH = 600;
export const MAX_LABEL_LENGTH = 80;
export const MAX_NOTE_LENGTH = 60;
export const MAX_CLAIMS = 20;
export const MAX_AMOUNT = 10n ** 18n;

export const RESERVED_TOKENS = [
  "<UNTRUSTED_CAP_TEXT>", "</UNTRUSTED_CAP_TEXT>", "<UNTRUSTED_CLAIMANT_LABEL>", "</UNTRUSTED_CLAIMANT_LABEL>", "AGGREGATE", "PER_EVENT",
] as const;

export const REVERTS = {
  invalidWallet: "Invalid wallet address",
  labelEmpty: "Label is empty",
  labelTooLong: "Label is too long",
  textEmpty: "Text is empty",
  textTooLong: "Text is too long",
  reserved: "Text or label contains a reserved token",
  capRange: "The cap amount is out of range",
  selfClaimant: "The claimant cannot be the author",
  exists: "This cap already exists",
  unknown: "Unknown cap id",
  onlyClaimantAccept: "Only the named claimant may accept or decline",
  notAwaiting: "This cap is not awaiting acceptance",
  mismatch: "The accepted text does not match this cap",
  noteEmpty: "Note is empty",
  noteTooLong: "Note is too long",
  onlyClaimantClaim: "Only the named claimant may record a claim",
  notActive: "This cap is not active",
  claimRange: "The claim amount is out of range",
  noRoom: "No room for further claims",
  usedUp: "The cap has been used up",
  onlyAuthor: "Only the author may confirm or reject a claim",
  noSuchClaim: "No such claim",
  notPending: "This claim is not pending",
} as const;

/** UI-only reasons (the contract never sees these calls). */
export const UI = {
  noWallet: "Connect a wallet first",
  notRead: "Tick the box after reading the text",
  tooManyBytes: "This text is over the 255-byte calldata limit; shorten it",
} as const;

const ZERO = "0x" + "0".repeat(40);
const same = (a: string, b: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function walletOrEmpty(value: string): string {
  const w = pyStrip(value).toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(w) ? w : "";
}

export function parseWhole(value: string): bigint | null {
  const s = value.trim().replace(/[,_\s]/g, "");
  return /^\d+$/.test(s) ? BigInt(s) : null;
}

export type OpenInput = { me: string; claimant: string; label: string; amount: string; text: string; exists: boolean; bytes: number };

/** open_cap order: wallet -> label -> text -> reserved -> amount -> not the author -> not opened before. */
export function openBlock(i: OpenInput): string | null {
  if (!i.me) return UI.noWallet;
  const w = walletOrEmpty(i.claimant);
  if (!w || w === ZERO) return REVERTS.invalidWallet;
  const label = pyNormalize(i.label);
  if (pyLen(label) === 0) return REVERTS.labelEmpty;
  if (pyLen(label) > MAX_LABEL_LENGTH) return REVERTS.labelTooLong;
  const text = pyStrip(i.text);
  if (pyLen(text) === 0) return REVERTS.textEmpty;
  if (pyLen(text) > MAX_TEXT_LENGTH) return REVERTS.textTooLong;
  if (pyContainsToken(label, RESERVED_TOKENS) || pyContainsToken(text, RESERVED_TOKENS)) return REVERTS.reserved;
  const a = parseWhole(i.amount);
  if (a === null || a <= 0n || a > MAX_AMOUNT) return REVERTS.capRange;
  if (same(w, i.me)) return REVERTS.selfClaimant;
  if (i.exists) return REVERTS.exists;
  if (i.bytes > 255) return UI.tooManyBytes;
  return null;
}

/** accept_cap order: claimant -> PROPOSED -> the hash of the text shown equals the stored hash. */
export function acceptBlock(c: Cap, me: string, read: boolean): string | null {
  if (!me) return UI.noWallet;
  if (!same(c.claimant_wallet, me)) return REVERTS.onlyClaimantAccept;
  if (c.state !== "PROPOSED") return REVERTS.notAwaiting;
  if (textHashOf(c.text) !== c.text_hash) return REVERTS.mismatch;
  if (!read) return UI.notRead;
  return null;
}

export function declineBlock(c: Cap, me: string): string | null {
  if (!me) return UI.noWallet;
  if (!same(c.claimant_wallet, me)) return REVERTS.onlyClaimantAccept;
  if (c.state !== "PROPOSED") return REVERTS.notAwaiting;
  return null;
}

/** record_claim order: note -> claimant -> ACTIVE -> amount -> room -> not used up. */
export function claimBlock(c: Cap, me: string, amount: string, note: string, bytes: number): string | null {
  if (!me) return UI.noWallet;
  const n = pyStrip(note);
  if (pyLen(n) === 0) return REVERTS.noteEmpty;
  if (pyLen(n) > MAX_NOTE_LENGTH) return REVERTS.noteTooLong;
  if (!same(c.claimant_wallet, me)) return REVERTS.onlyClaimantClaim;
  if (c.state !== "ACTIVE") return REVERTS.notActive;
  const a = parseWhole(amount);
  if (a === null || a <= 0n || a > MAX_AMOUNT) return REVERTS.claimRange;
  if (c.claim_count >= MAX_CLAIMS) return REVERTS.noRoom;
  if (BigInt(c.remaining) <= 0n) return REVERTS.usedUp;
  if (bytes > 255) return UI.tooManyBytes;
  return null;
}

/** confirm_claim order: author -> claim exists -> pending -> something payable. */
export function confirmBlock(c: Cap, k: Claim, me: string): string | null {
  if (!me) return UI.noWallet;
  if (!same(c.author, me)) return REVERTS.onlyAuthor;
  if (k.index <= 0 || k.index > c.claim_count) return REVERTS.noSuchClaim;
  if (k.state !== "PENDING") return REVERTS.notPending;
  if (BigInt(k.payable_if_confirmed_now) <= 0n) return REVERTS.usedUp;
  return null;
}

/** reject_claim order: note -> author -> claim exists -> pending. */
export function rejectBlock(c: Cap, k: Claim, me: string, note: string): string | null {
  if (!me) return UI.noWallet;
  const n = pyStrip(note);
  if (pyLen(n) === 0) return REVERTS.noteEmpty;
  if (pyLen(n) > MAX_NOTE_LENGTH) return REVERTS.noteTooLong;
  if (!same(c.author, me)) return REVERTS.onlyAuthor;
  if (k.index <= 0 || k.index > c.claim_count) return REVERTS.noSuchClaim;
  if (k.state !== "PENDING") return REVERTS.notPending;
  return null;
}

/** The payable amount the contract will record for `amount` right now. */
export function previewPayable(c: Cap, amount: bigint): bigint {
  const rem = BigInt(c.remaining);
  return amount < rem ? amount : rem;
}
