import { abi, createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { getAddress } from 'viem'
import { CONTRACT_ADDRESS, STUDIO_CHAIN_HEX, rpcUrl } from './config'
import { normalizeError } from './errors'
import { pyNormalizeWhitespace, pyStrip } from './pytext.mjs'

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<any>
  on?: (event: string, listener: (...args: any[]) => void) => void
  removeListener?: (event: string, listener: (...args: any[]) => void) => void
}

declare global {
  interface Window { ethereum?: EthereumProvider }
}

export type Scope = 'POOL' | 'FRESH'
export type Verdict = 'AGGREGATE' | 'PER_EVENT'

export type Cap = {
  cap_id: string
  author: string
  outcome: Verdict
  claimant_wallet: string
  claimant_label: string
  text: string
  cap_amount: number
  scope: Scope
  used: number
  claim_count: number
  remaining: number
  exhausted: boolean
}

export type Claim = {
  cap_id: string
  index: number
  amount: number
  payable: number
  note: string
  dispute_note: string
}

type TransactionOutcome =
  | { status: 'PENDING' }
  | { status: 'SUCCESS' }
  | { status: 'ERROR'; reason: string }

export type WriteOutcome =
  | { status: 'SUCCESS'; cap: Cap; claims: Claim[] }
  | { status: 'DELAYED' }

const proxiedChain = () => ({
  ...studionet,
  rpcUrls: { default: { http: [rpcUrl()] } },
})

const readClient = () => createClient({ chain: proxiedChain() } as any)
const writeClient = (account: string) => createClient({
  chain: proxiedChain(),
  account: getAddress(account) as any,
  provider: window.ethereum as any,
} as any)

function requireContract() {
  if (!CONTRACT_ADDRESS) throw new Error('Contract address is not configured. Set VITE_CONTRACT_ADDRESS.')
  return CONTRACT_ADDRESS
}

async function ensureStudioNet() {
  const ethereum = window.ethereum
  if (!ethereum) throw new Error('No browser wallet detected.')
  const current = String(await ethereum.request({ method: 'eth_chainId' })).toLowerCase()
  if (current === STUDIO_CHAIN_HEX) return
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: STUDIO_CHAIN_HEX }] })
    return
  } catch (error: any) {
    if (error?.code !== 4902 && error?.data?.originalError?.code !== 4902) throw error
  }
  await ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: STUDIO_CHAIN_HEX,
      chainName: 'GenLayer StudioNet',
      rpcUrls: [rpcUrl()],
      nativeCurrency: { name: 'GEN Token', symbol: 'GEN', decimals: 18 },
    }],
  })
  await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: STUDIO_CHAIN_HEX }] })
}

const unpack = <T,>(raw: unknown): T => {
  if (raw && typeof raw === 'object' && 'result' in (raw as any)) return unpack<T>((raw as any).result)
  if (typeof raw === 'string') {
    try { return JSON.parse(raw.trim()) as T } catch { return raw as T }
  }
  return raw as T
}

const isId = (value: unknown) => typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value)
const isAddress = (value: unknown) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)

function validateCap(value: any): Cap {
  if (!value || !isId(value.cap_id) || !isAddress(value.author) || !isAddress(value.claimant_wallet) ||
    typeof value.claimant_label !== 'string' || typeof value.text !== 'string' ||
    !['AGGREGATE', 'PER_EVENT'].includes(value.outcome) || !['POOL', 'FRESH'].includes(value.scope) ||
    !Number.isFinite(value.cap_amount) || !Number.isFinite(value.used) ||
    !Number.isFinite(value.claim_count) || !Number.isFinite(value.remaining) ||
    typeof value.exhausted !== 'boolean') {
    throw new Error('Malformed get_cap response from RPC.')
  }
  return value as Cap
}

function validateClaim(value: any): Claim {
  if (!value || !isId(value.cap_id) || !Number.isFinite(value.index) ||
    !Number.isFinite(value.amount) || !Number.isFinite(value.payable) ||
    typeof value.note !== 'string' || typeof value.dispute_note !== 'string') {
    throw new Error('Malformed claim response from RPC.')
  }
  return value as Claim
}

async function read(functionName: string, args: string[] = []) {
  return readClient().readContract({
    address: requireContract(), functionName, args, stateStatus: 'accepted',
  } as any)
}

async function submit(account: string, functionName: string, args: string[]) {
  if (!window.ethereum) throw new Error('No browser wallet detected.')
  await ensureStudioNet()
  return String(await writeClient(account).writeContract({
    address: requireContract(), functionName, args, value: 0n,
  } as any))
}

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  })
  const body = await response.json()
  if (!response.ok || body.error) throw new Error(body?.error?.message || `RPC ${response.status}`)
  return body.result
}

function leaderReceipt(transaction: any) {
  const consensus = transaction?.consensus_data ?? transaction?.consensusData
  const raw = consensus?.leader_receipt ?? consensus?.leaderReceipt
  if (!Array.isArray(raw)) return raw
  return raw.find((item: any) => String(item?.mode || '').toLowerCase() === 'leader') ?? raw[0]
}

async function transactionOutcome(hash: string): Promise<TransactionOutcome> {
  try {
    const transaction = await rpc('eth_getTransactionByHash', [hash])
    if (!transaction) return { status: 'PENDING' }
    const receipt = leaderReceipt(transaction)
    if (!receipt) return { status: 'PENDING' }
    const result = String(receipt.execution_result ?? receipt.executionResult ?? '').toUpperCase()
    if (result === 'SUCCESS' || result === 'FINISHED_WITH_RETURN') return { status: 'SUCCESS' }
    if (result === 'ERROR' || result === 'FINISHED_WITH_ERROR') {
      return {
        status: 'ERROR',
        reason: normalizeError(receipt.error ?? receipt.message ?? receipt.return_data ?? receipt.returnData ?? receipt),
      }
    }
    return { status: 'PENDING' }
  } catch { return { status: 'PENDING' } }
}

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export async function settleCapWrite(
  hash: string,
  capId: string,
  accepted: (cap: Cap, claims: Claim[]) => boolean,
): Promise<WriteOutcome> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const cap = await capScope.getCap(capId)
      const claims = await capScope.getClaims(capId)
      if (accepted(cap, claims)) return { status: 'SUCCESS', cap, claims }
    } catch { /* Open writes are absent until accepted state advances. */ }
    const outcome = await transactionOutcome(hash)
    if (outcome.status === 'ERROR') throw new Error(outcome.reason)
    await delay(3_000)
  }
  const outcome = await transactionOutcome(hash)
  if (outcome.status === 'ERROR') throw new Error(outcome.reason)
  return { status: 'DELAYED' }
}

export async function connectWallet() {
  if (!window.ethereum) throw new Error('No browser wallet detected. Install MetaMask or a compatible wallet.')
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
  if (!accounts?.[0]) throw new Error('Wallet connection was not approved.')
  await ensureStudioNet()
  return getAddress(accounts[0])
}

export async function passiveWallet() {
  if (!window.ethereum) return ''
  const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[]
  return accounts?.[0] ? getAddress(accounts[0]) : ''
}

export const capScope = {
  openCap: (account: string, claimant: string, label: string, amount: string, text: string) =>
    submit(account, 'open_cap', [getAddress(claimant.trim()), pyNormalizeWhitespace(label), amount, pyStrip(text)]),
  recordClaim: (account: string, capId: string, amount: string, note: string) =>
    submit(account, 'record_claim', [capId.trim().toLowerCase(), amount, pyStrip(note)]),
  disputeClaim: (account: string, capId: string, index: number, note: string) =>
    submit(account, 'dispute_claim', [capId.trim().toLowerCase(), String(index), pyStrip(note)]),
  getCap: async (id: string) => {
    const value = unpack<any>(await read('get_cap', [id.trim().toLowerCase()]))
    if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
      const error = new Error('Unknown cap id') as Error & { code?: string }
      error.code = 'CAP_NOT_FOUND'
      throw error
    }
    return validateCap(value)
  },
  getClaims: async (id: string) => {
    const value = unpack<any>(await read('get_claims', [id.trim().toLowerCase(), '0', '50']))
    if (!Array.isArray(value)) return []
    return value.map(validateClaim)
  },
  getClaim: async (id: string, index: number) => validateClaim(
    unpack<any>(await read('get_claim', [id.trim().toLowerCase(), String(index)])),
  ),
}

export function openCapCalldataBytes(claimant: string, label: string, amount: string, text: string) {
  const call = abi.calldata.encode({
    method: 'open_cap',
    args: [claimant.trim(), pyNormalizeWhitespace(label), amount, pyStrip(text)],
  })
  return (abi.transactions.serialize([call, false]).length - 2) / 2
}

export { normalizeError }
