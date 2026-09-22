/**
 * rateLimit.ts — Wrapper testleri (Faz 7.3.49 → Faz 7.5.3 Upstash uyarlaması)
 *
 * testEnvironment: 'node'
 *
 * rateLimit.ts artık Upstash Redis üzerinden çalışır; burada @upstash/ratelimit
 * ve @upstash/redis in-memory sliding-window ile mock'lanır. Test edilen şey
 * checkRateLimit wrapper'ının sözleşmesidir:
 *
 * T9:  Limit aşımı → allowed:false, retryAfterMs > 0
 * T10: Limit altı → allowed:true
 * T11: Farklı key'ler birbirinden bağımsız (API endpoint ayrımı)
 * T12: Upstash hatası → fail-open (allowed:true)
 * T13: config.max → doğru named limiter seçimi (login / upload / general)
 */

// ─── In-memory Upstash mock ──────────────────────────────────────────────────

type Hit = { ts: number }
const store = new Map<string, Hit[]>()
let failNext: Error | null = null

/** "1 m" / "30 s" / "500 ms" → ms */
function parseWindow(win: string): number {
  const [n, unit] = win.trim().split(/\s+/)
  const v = Number(n)
  if (unit === 'ms') return v
  if (unit === 's')  return v * 1000
  if (unit === 'm')  return v * 60_000
  if (unit === 'h')  return v * 3_600_000
  throw new Error(`unknown window unit: ${unit}`)
}

class MockRatelimit {
  private prefix: string
  private max: number
  private windowMs: number
  static instances: MockRatelimit[] = []

  constructor(opts: { prefix: string; limiter: { max: number; windowMs: number } }) {
    this.prefix   = opts.prefix
    this.max      = opts.limiter.max
    this.windowMs = opts.limiter.windowMs
    MockRatelimit.instances.push(this)
  }

  static slidingWindow(max: number, win: string) {
    return { max, windowMs: parseWindow(win) }
  }

  async limit(key: string) {
    if (failNext) { const e = failNext; failNext = null; throw e }
    const now  = Date.now()
    const full = `${this.prefix}:${key}`
    const hits = (store.get(full) ?? []).filter(h => now - h.ts < this.windowMs)
    if (hits.length >= this.max) {
      store.set(full, hits)
      return { success: false, limit: this.max, remaining: 0, reset: hits[0].ts + this.windowMs }
    }
    hits.push({ ts: now })
    store.set(full, hits)
    return { success: true, limit: this.max, remaining: this.max - hits.length, reset: now + this.windowMs }
  }
}

jest.mock('@upstash/ratelimit', () => ({ Ratelimit: MockRatelimit }))
jest.mock('@upstash/redis',     () => ({ Redis: { fromEnv: jest.fn(() => ({})) } }))

import { checkRateLimit } from './rateLimit'

beforeEach(() => {
  store.clear()
  failNext = null
})

// ─── SUITE ───────────────────────────────────────────────────────────────────

describe('checkRateLimit', () => {

  // Named limiter'lar: max ≤ 5 → login (5/dk), ≤ 10 → upload (10/dk), diğer → general (60/dk)
  const LOGIN_CONFIG   = { windowMs: 60_000, max: 5 }
  const UPLOAD_CONFIG  = { windowMs: 60_000, max: 10 }
  const GENERAL_CONFIG = { windowMs: 60_000, max: 60 }

  // T10 — Limit altı → geçer
  test('T10 — max dolmadan her istek allowed:true döner', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit('test-key', LOGIN_CONFIG)
      expect(result.allowed).toBe(true)
      expect(result.retryAfterMs).toBe(0)
    }
  })

  // T9 — Limit aşımı → reddedilir
  test('T9 — max+1. istek allowed:false, retryAfterMs > 0', async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('test-key', LOGIN_CONFIG)
    }

    const result = await checkRateLimit('test-key', LOGIN_CONFIG)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000)
  })

  // T11a — Farklı key'ler bağımsız (login vs upload)
  test('T11a — login ve upload key\'leri birbirinden bağımsız sayılır', async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('login:1.2.3.4', LOGIN_CONFIG)
    }
    const loginBlocked = await checkRateLimit('login:1.2.3.4', LOGIN_CONFIG)
    expect(loginBlocked.allowed).toBe(false)

    // upload aynı IP'de hâlâ serbest
    const uploadAllowed = await checkRateLimit('upload:1.2.3.4', UPLOAD_CONFIG)
    expect(uploadAllowed.allowed).toBe(true)
  })

  // T11b — Farklı IP'ler bağımsız
  test('T11b — Farklı IP\'ler aynı endpoint\'te bağımsız sayılır', async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('login:1.1.1.1', LOGIN_CONFIG)
    }
    const ip1Blocked = await checkRateLimit('login:1.1.1.1', LOGIN_CONFIG)
    expect(ip1Blocked.allowed).toBe(false)

    const ip2Allowed = await checkRateLimit('login:2.2.2.2', LOGIN_CONFIG)
    expect(ip2Allowed.allowed).toBe(true)
  })

  // T11c — Pencere geçince yeniden geçer
  test('T11c — pencere süresi geçince istek yeniden geçer', async () => {
    const nowSpy = jest.spyOn(Date, 'now')
    const t0 = 1_000_000
    nowSpy.mockReturnValue(t0)

    for (let i = 0; i < 5; i++) {
      await checkRateLimit('scenario:1.2.3.4', LOGIN_CONFIG)
    }
    const blocked = await checkRateLimit('scenario:1.2.3.4', LOGIN_CONFIG)
    expect(blocked.allowed).toBe(false)

    // 1 dk + 1 ms sonra pencere biter
    nowSpy.mockReturnValue(t0 + 60_001)
    const result = await checkRateLimit('scenario:1.2.3.4', LOGIN_CONFIG)
    expect(result.allowed).toBe(true)

    nowSpy.mockRestore()
  })

  // T12 — Upstash hatası → fail-open
  test('T12 — Upstash hatası → allowed:true (fail-open), retryAfterMs 0', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    failNext = new Error('ECONNREFUSED')

    const result = await checkRateLimit('any-key', GENERAL_CONFIG)
    expect(result).toEqual({ allowed: true, retryAfterMs: 0 })
    expect(errSpy).toHaveBeenCalled()

    errSpy.mockRestore()
  })

  // T13 — config.max → named limiter seçimi
  test('T13 — config.max > 10 → general limiter (60/dk), 11. istek geçer', async () => {
    // upload limiter'da 11. istek düşerdi; general'de geçmeli
    for (let i = 0; i < 10; i++) {
      await checkRateLimit('gen:1.2.3.4', GENERAL_CONFIG)
    }
    const eleventh = await checkRateLimit('gen:1.2.3.4', GENERAL_CONFIG)
    expect(eleventh.allowed).toBe(true)
  })

})
