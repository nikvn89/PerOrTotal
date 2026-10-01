// Python str.isspace() code points relevant to str.strip() and str.split().
const PY_WS_CLASS = "\\u0009-\\u000d\\u001c-\\u001f\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000"
const PY_WS_EDGE = new RegExp(`^[${PY_WS_CLASS}]+|[${PY_WS_CLASS}]+$`, "gu")
const PY_WS_RUN = new RegExp(`[${PY_WS_CLASS}]+`, "gu")

export function pyStrip(value) {
  return String(value).replace(PY_WS_EDGE, "")
}

export function pyLen(value) {
  return Array.from(String(value)).length
}

export function pyNormalizeWhitespace(value) {
  const stripped = pyStrip(value)
  return stripped ? stripped.split(PY_WS_RUN).filter(Boolean).join(" ") : ""
}
