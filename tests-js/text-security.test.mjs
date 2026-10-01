import test from 'node:test'
import assert from 'node:assert/strict'
import { pyLen, pyNormalizeWhitespace, pyStrip } from '../src/pytext.mjs'
import { escapeHtml } from '../src/security.mjs'
import { extractRollback } from '../src/errors.ts'

test('matches Python-style whitespace normalization', () => {
  assert.equal(pyNormalizeWhitespace('\u00a0  one\n\t two  '), 'one two')
  assert.equal(pyStrip('\u3000text\u3000'), 'text')
  assert.equal(pyLen('A😀'), 2)
})

test('escapes untrusted text when rendered outside React', () => {
  assert.equal(escapeHtml('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;')
})

test('extracts contract rollback messages', () => {
  assert.equal(extractRollback('execution reverted: The cap has been used up'), 'The cap has been used up')
})
