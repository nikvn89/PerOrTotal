import test from 'node:test'
import assert from 'node:assert/strict'
import { requireCapAbsent } from '../src/preflight.mjs'

test('allows an unknown cap ID', async () => {
  const missing = Object.assign(new Error('Unknown cap id'), { code: 'CAP_NOT_FOUND' })
  assert.equal(await requireCapAbsent(async () => { throw missing }, 'abc'), true)
})

test('blocks accidental duplicate submission', async () => {
  await assert.rejects(
    requireCapAbsent(async () => ({ cap_id: 'abc' }), 'abc'),
    /already exists/,
  )
})

test('does not hide unrelated RPC errors', async () => {
  await assert.rejects(
    requireCapAbsent(async () => { throw new Error('RPC unavailable') }, 'abc'),
    /RPC unavailable/,
  )
})
