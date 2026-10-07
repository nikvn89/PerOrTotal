import { keccak256, stringToBytes } from "viem";
import { pyLen, pyNormalize, pyStrip } from "./pytext.ts";

// Keccak-256 (Ethereum), not NIST SHA3-256. Same payloads as the contract:
//   cap id    = keccak256("CAP_ACCORD:CAP:V1|" + author_lower + "|" + len(t) + "|" + t)
//   text hash = keccak256(t)
// where t is the agreement text, Python-stripped with whitespace collapsed.
export function normText(text: string): string {
  return pyNormalize(pyStrip(text));
}

export function capIdOf(author: string, text: string): string {
  const t = normText(text);
  return keccak256(stringToBytes("CAP_ACCORD:CAP:V1|" + author.toLowerCase() + "|" + pyLen(t) + "|" + t)).slice(2);
}

/** What the claimant signs when accepting: the hash of the exact text they read. */
export function textHashOf(text: string): string {
  return keccak256(stringToBytes(normText(text))).slice(2);
}

/** Every 64-hex id found in a bare id, a 0x id, a link or a comma list. */
export function idsFromInput(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(/(?<![0-9a-fA-F])([0-9a-fA-F]{64})(?![0-9a-fA-F])/g)) {
    const id = m[1].toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function short(value: string, head = 6, tail = 4): string {
  if (!value || value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** 10000 -> "10,000" (amounts are whole ledger numbers). */
export function fmt(value: string | number | bigint): string {
  const s = String(value);
  return /^\d+$/.test(s) ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : s;
}
