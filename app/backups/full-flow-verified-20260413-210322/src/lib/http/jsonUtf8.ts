import { NextResponse } from 'next/server'

function normalizeStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.normalize('NFC')
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeStrings(item))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normalizeStrings(item)
    }
    return out
  }
  return value
}

export function jsonUtf8(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(normalizeStrings(body), init)
  response.headers.set('Content-Type', 'application/json; charset=utf-8')
  return response
}

