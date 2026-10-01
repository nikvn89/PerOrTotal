import { contractReceiptMessage } from './rpc-errors.mjs'

const collect = (error: unknown, depth = 0): string[] => {
  if (depth > 6 || error == null) return []
  const value = error as any
  const out: string[] = []

  for (const candidate of [
    value?.shortMessage,
    value?.details,
    value?.data?.message,
    value?.data?.data,
    value?.error?.message,
    value?.message,
    typeof error === 'string' ? error : '',
  ]) {
    if (typeof candidate === 'string' && candidate.trim()) out.push(candidate)
  }

  if (value?.cause) out.push(...collect(value.cause, depth + 1))
  return out
}

export function extractRollback(raw: string) {
  for (const pattern of [
    /\[rollback\]\s*([^\n"}]+)/i,
    /UserError[:\s]+([^\n"}]+)/i,
    /execution reverted[:\s]+([^\n"}]+)/i,
  ]) {
    const match = raw.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

export function normalizeError(error: unknown) {
  const receiptMessage = contractReceiptMessage(error)
  if (receiptMessage) return receiptMessage

  const candidates = collect(error)
  const joined = candidates.join('\n')
  const rollback = extractRollback(joined)
  if (rollback) return rollback

  const message = String(candidates[0] || 'Unknown error')
    .replace(/^Error:\s*/i, '')
    .trim()

  if (/user rejected|user denied|rejected the request/i.test(message)) {
    return 'Wallet request was rejected.'
  }
  if (/wallet_requestSnaps|wallet_getSnaps|snap/i.test(message)) {
    return 'A wallet Snap request appeared. Reload and retry; PerOrTotal does not use a Snap.'
  }
  if (/429|rate limit/i.test(message)) {
    return 'StudioNet is rate-limiting requests. Wait, then refresh state; do not resend a known hash.'
  }
  if (/failed to fetch|network error|cors/i.test(message)) {
    return 'RPC read failed. If a hash was returned, refresh authoritative state instead of resending.'
  }
  return message
}
