import test from 'node:test'
import assert from 'node:assert/strict'
import { claimBlockReason, disputeBlockReason, predictedPayable } from '../src/domain.mjs'
import { pyLen, pyStrip } from '../src/pytext.mjs'

const author = '0x6276095FAEA15108740445ff277fdA8c304657F4'
const claimant = '0x037f58E33c1Ec8fdA272361E0aAC1e31054a1CDE'
const base = {
  author,
  claimant_wallet: claimant,
  cap_amount: 10000,
  remaining: 4000,
  claim_count: 1,
  exhausted: false,
}

test('POOL remembers earlier claims', () => {
  assert.equal(predictedPayable({ ...base, scope: 'POOL' }, '6000'), 4000)
})

test('FRESH restarts from the full cap', () => {
  assert.equal(predictedPayable({ ...base, scope: 'FRESH' }, '6000'), 6000)
  assert.equal(predictedPayable({ ...base, scope: 'FRESH' }, '15000'), 10000)
})

test('only claimant can record a valid claim', () => {
  const cap = { ...base, scope: 'POOL' }
  assert.equal(claimBlockReason(cap, claimant, '6000', 'first', pyStrip, pyLen), '')
  assert.match(claimBlockReason(cap, author, '6000', 'first', pyStrip, pyLen), /Only the named claimant/)
})

test('exhausted pool blocks another claim', () => {
  const cap = { ...base, scope: 'POOL', exhausted: true }
  assert.match(claimBlockReason(cap, claimant, '1', 'third', pyStrip, pyLen), /used up/)
})

test('author alone can add one dispute note', () => {
  const cap = { ...base, scope: 'POOL' }
  const claim = { dispute_note: '' }
  assert.equal(disputeBlockReason(cap, claim, author, 'Not accepted', pyStrip, pyLen), '')
  assert.match(disputeBlockReason(cap, claim, claimant, 'Not accepted', pyStrip, pyLen), /Only the author/)
  assert.match(disputeBlockReason(cap, { dispute_note: 'Already' }, author, 'Again', pyStrip, pyLen), /already been disputed/)
})
