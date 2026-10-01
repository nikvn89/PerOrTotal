function decodeResult(value) {
  if (typeof value !== 'string' || !value) return ''
  try {
    const binary = globalThis.atob(value)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return new TextDecoder().decode(bytes).replace(/^\p{Cc}+/u, '').trim()
  } catch {
    return ''
  }
}

export function contractReceiptMessage(error) {
  const seen = new Set()

  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return ''
    seen.add(value)

    const result = String(value.execution_result ?? value.executionResult ?? '').toUpperCase()
    if (result === 'ERROR' || result === 'FINISHED_WITH_ERROR') {
      for (const candidate of [value.error, value.message, value.return_data, value.returnData]) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
      }
      const decoded = decodeResult(value.result)
      if (decoded) return decoded
    }

    for (const nested of [value.cause, value.data, value.error, value.receipt]) {
      const message = visit(nested, depth + 1)
      if (message) return message
    }
    return ''
  }

  return visit(error)
}
