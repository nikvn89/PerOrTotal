import { abi } from 'genlayer-js'

const { calldata, transactions } = abi
const LIMIT = 255
const WALLET = '0x2222222222222222222222222222222222222222'
const LABEL = 'the Claimant'
const CAP_ID = 'a'.repeat(64)

const cases = [
  ['A1', 'AGGREGATE', 'Our liability is limited to the agreed sum in total.'],
  ['A2', 'AGGREGATE', 'Across all claims together, we will not pay more than the agreed sum.'],
  ['A3', 'AGGREGATE', 'The agreed sum is the most we will ever pay under this arrangement.'],
  ['A4', 'AGGREGATE', 'Once the agreed sum has been paid out, nothing further is payable.'],
  ['A5', 'AGGREGATE', 'Every payment we make is taken from one agreed sum.'],
  ['P1', 'PER_EVENT', 'Our liability is limited to the agreed sum for each incident.'],
  ['P2', 'PER_EVENT', 'For any one claim, we will not pay more than the agreed sum.'],
  ['P3', 'PER_EVENT', 'The agreed sum is the most we will pay on any single occasion.'],
  ['P4', 'PER_EVENT', 'Each new incident starts again from the full agreed sum.'],
  ['P5', 'PER_EVENT', 'Every claim is measured on its own against the agreed sum.'],
]

const byteLength = (hex) => (hex.length - 2) / 2
const encodeBytes = (method, args) => {
  const call = calldata.encode({ method, args })
  return byteLength(transactions.serialize([call, false]))
}

const hardGate = cases.map(([id, expected, text]) => ({
  case: id,
  method: 'open_cap',
  expected,
  textBytes: new TextEncoder().encode(text).length,
  genvmBytes: encodeBytes('open_cap', [WALLET, LABEL, 10000, text]),
}))

hardGate.push(
  {
    case: 'WRITE-record-max-note',
    method: 'record_claim',
    expected: 'deterministic',
    textBytes: 60,
    genvmBytes: encodeBytes('record_claim', [CAP_ID, 10n ** 18n, 'n'.repeat(60)]),
  },
  {
    case: 'WRITE-dispute-max-note',
    method: 'dispute_claim',
    expected: 'deterministic',
    textBytes: 60,
    genvmBytes: encodeBytes('dispute_claim', [CAP_ID, 20, 'n'.repeat(60)]),
  },
)

for (const row of hardGate) {
  row.result = row.genvmBytes <= LIMIT ? 'PASS' : 'BLOCK'
}

const measureOnly = [
  {
    case: 'MAX_TEXT_600',
    method: 'open_cap',
    textBytes: 600,
    genvmBytes: encodeBytes('open_cap', [WALLET, LABEL, 10n ** 18n, 'x'.repeat(600)]),
    result: 'MEASURE_ONLY',
  },
  {
    case: 'MAX_TEXT_600_MAX_LABEL_80',
    method: 'open_cap',
    textBytes: 680,
    genvmBytes: encodeBytes('open_cap', [WALLET, 'l'.repeat(80), 10n ** 18n, 'x'.repeat(600)]),
    result: 'MEASURE_ONLY',
  },
]

console.log(`GENVM_CALLDATA_LIMIT ${LIMIT}`)
console.log('\nHARD GATE')
console.table(hardGate)
console.log('\nMEASURE ONLY (does not fail this gate)')
console.table(measureOnly)

const failures = hardGate.filter((row) => row.result !== 'PASS')
if (failures.length) {
  console.error(`CALLDATA_HARD_GATE_FAIL ${failures.length}/${hardGate.length}`)
  process.exitCode = 1
} else {
  console.log(`CALLDATA_HARD_GATE_PASS ${hardGate.length}/${hardGate.length}`)
}
