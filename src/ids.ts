import { keccak256, toBytes } from 'viem'
import { pyLen, pyNormalizeWhitespace, pyStrip } from './pytext.mjs'

export function capIdFor(author: string, text: string) {
  const normalized = pyNormalizeWhitespace(pyStrip(text))
  const payload =
    'CAP_SCOPE:CAP:V1|' +
    author.toLowerCase() +
    '|' +
    pyLen(normalized) +
    '|' +
    normalized
  return keccak256(toBytes(payload)).slice(2).toLowerCase()
}

export function isCapId(value: string) {
  return /^[a-fA-F0-9]{64}$/.test(value.trim())
}
