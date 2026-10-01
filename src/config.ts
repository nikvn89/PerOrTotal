const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const configuredAddress = String(import.meta.env.VITE_CONTRACT_ADDRESS || '').trim()
const PROJECT_DEPLOYMENT = '0x3579A82696B64bAB406341A500e23977172d5a6C'

export const CONTRACT_ADDRESS = ADDRESS_RE.test(configuredAddress)
  ? (configuredAddress as `0x${string}`)
  : (PROJECT_DEPLOYMENT as `0x${string}`)

export const STUDIO_CHAIN_ID = 61999
export const STUDIO_CHAIN_HEX = `0x${STUDIO_CHAIN_ID.toString(16)}`
export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com'

export function rpcUrl() {
  if (typeof window === 'undefined') return '/api/rpc'
  return `${window.location.origin}/api/rpc`
}

export function contractExplorerUrl() {
  return CONTRACT_ADDRESS
    ? `${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`
    : EXPLORER_BASE
}

export function transactionExplorerUrl(hash: string) {
  return `${EXPLORER_BASE}/tx/${hash}`
}
