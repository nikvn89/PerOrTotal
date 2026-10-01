import { abi } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { encodeFunctionData } from 'viem'

const RPC = process.env.STUDIONET_RPC || 'https://studio.genlayer.com/api'
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || ''
const FROM_ADDRESS = process.env.FROM_ADDRESS || ''
const CLAIMANT_WALLET = process.env.CLAIMANT_WALLET || ''
const LABEL = 'the Claimant'

if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
  throw new Error('Set CONTRACT_ADDRESS to the deployed CapScope address.')
}
if (!/^0x[0-9a-fA-F]{40}$/.test(FROM_ADDRESS)) {
  throw new Error('Set FROM_ADDRESS to the author wallet.')
}
if (!/^0x[0-9a-fA-F]{40}$/.test(CLAIMANT_WALLET)) {
  throw new Error('Set CLAIMANT_WALLET to the separate claimant wallet.')
}

const cases = [
  ['A1', 'Our liability is limited to the agreed sum in total.'],
  ['A2', 'Across all claims together, we will not pay more than the agreed sum.'],
  ['A3', 'The agreed sum is the most we will ever pay under this arrangement.'],
  ['A4', 'Once the agreed sum has been paid out, nothing further is payable.'],
  ['A5', 'Every payment we make is taken from one agreed sum.'],
  ['P1', 'Our liability is limited to the agreed sum for each incident.'],
  ['P2', 'For any one claim, we will not pay more than the agreed sum.'],
  ['P3', 'The agreed sum is the most we will pay on any single occasion.'],
  ['P4', 'Each new incident starts again from the full agreed sum.'],
  ['P5', 'Every claim is measured on its own against the agreed sum.'],
]

const addTransactionAbi = studionet.consensusMainContract.abi.filter(
  (entry) => entry.type === 'function' && entry.name === 'addTransaction',
)
if (addTransactionAbi.length !== 1) {
  throw new Error(`Expected one addTransaction ABI entry, found ${addTransactionAbi.length}.`)
}

const { calldata, transactions } = abi
let requestId = 0

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      origin: 'https://studio.genlayer.com',
      referer: 'https://studio.genlayer.com/',
      'user-agent': 'CapScope-Calldata-Probe/0.1',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(12_000),
  })
  const body = await response.json()
  if (!response.ok || body.error) {
    const detail = body.error
      ? `${body.error.code}: ${body.error.message}`
      : `HTTP ${response.status}`
    throw new Error(`${method} failed: ${detail}`)
  }
  return body.result
}

const byteLength = (hex) => (hex.length - 2) / 2

async function probe([id, text]) {
  const call = calldata.encode({
    method: 'open_cap',
    args: [CLAIMANT_WALLET, LABEL, 10000, text],
  })
  const txData = transactions.serialize([call, false])
  const wrapped = encodeFunctionData({
    abi: addTransactionAbi,
    functionName: 'addTransaction',
    args: [
      FROM_ADDRESS,
      CONTRACT_ADDRESS,
      BigInt(studionet.defaultNumberOfInitialValidators),
      BigInt(studionet.defaultConsensusMaxRotations),
      txData,
    ],
  })
  const gasHex = await rpc('eth_estimateGas', [{
    from: FROM_ADDRESS,
    to: studionet.consensusMainContract.address,
    data: wrapped,
    value: '0x0',
  }])
  return {
    id,
    textBytes: new TextEncoder().encode(text).length,
    genvmBytes: byteLength(txData),
    evmBytes: byteLength(wrapped),
    gas: BigInt(gasHex).toString(),
    result: 'PASS',
  }
}

const rows = []
for (const item of cases) {
  try {
    rows.push(await probe(item))
  } catch (error) {
    rows.push({
      id: item[0],
      textBytes: new TextEncoder().encode(item[1]).length,
      genvmBytes: '-',
      evmBytes: '-',
      gas: '-',
      result: `FAIL: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

console.log(`RPC ${RPC}`)
console.log(`CONTRACT_ADDRESS ${CONTRACT_ADDRESS}`)
console.table(rows)
const failures = rows.filter((row) => row.result !== 'PASS')
if (failures.length) {
  console.error(`CALLDATA_PROBE_FAIL ${failures.length}/${rows.length}`)
  process.exitCode = 1
} else {
  console.log(`CALLDATA_PROBE_PASS ${rows.length}/${rows.length}`)
}
