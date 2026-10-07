// Contract views return JSON strings. Amounts stay decimal strings.
import type { Cap, Claim } from "./types.ts";

function parseAny(raw: string): unknown {
  try {
    let value: unknown = JSON.parse(raw);
    if (typeof value === "string") value = JSON.parse(value);
    return value;
  } catch {
    return null;
  }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0 ? (v as Record<string, unknown>) : null;
}

const digits = (v: unknown) => typeof v === "string" && /^\d+$/.test(v);

function isClaim(o: Record<string, unknown> | null): boolean {
  return !!o && typeof o.index === "number" && digits(o.amount) && digits(o.payable) && digits(o.payable_if_confirmed_now) &&
    typeof o.state === "string";
}

export function parseCap(raw: string): Cap | null {
  const o = asObject(parseAny(raw));
  if (!o || typeof o.cap_id !== "string" || typeof o.text_hash !== "string" || typeof o.state !== "string" ||
      !digits(o.cap_amount) || !digits(o.used) || !digits(o.remaining) || typeof o.claim_count !== "number") return null;
  return o as unknown as Cap;
}

export function parseClaims(raw: string): Claim[] | null {
  const o = asObject(parseAny(raw));
  if (!o || !Array.isArray(o.claims)) return null;
  const rows = o.claims as unknown[];
  if (!rows.every((r) => isClaim(asObject(r)))) return null;
  return rows as Claim[];
}

export type Limits = { rubric_hash?: string; contract_name?: string; version?: string; max_claims?: number; two_party?: Record<string, boolean> };

export function parseLimits(raw: string): Limits | null {
  return asObject(parseAny(raw)) as Limits | null;
}
