const SECRET_KEY_PATTERN = /access_token|api_key|api_secret|token/i

export function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskSecrets)
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '***' : maskSecrets(val)
    }
    return out
  }
  return value
}
