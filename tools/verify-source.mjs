import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const normalize = (buffer) => {
  const text = buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\n?$/, '\n')
  return Buffer.from(text, 'utf8')
}

const source = normalize(await readFile(new URL('../contracts/CapScope.py', import.meta.url)))
const expectedText = await readFile(new URL('../SOURCE_SHA256.txt', import.meta.url), 'utf8')
const expected = expectedText.trim().split(/\s+/)[0]
const actual = createHash('sha256').update(source).digest('hex')

if (actual !== expected) {
  console.error(`SOURCE_HASH_FAIL expected=${expected} actual=${actual}`)
  process.exitCode = 1
} else {
  console.log(`SOURCE_HASH_PASS ${actual}`)
}
