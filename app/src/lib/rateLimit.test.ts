/**
 * rateLimit.ts — Pure helper testleri (Faz 7.3.49)
 *
 * testEnvironment: 'node'
 *
 * T9:  Limit aşımı → allowed:false, retryAfterMs > 0
 * T10: Limit altı → allowed:true
 * T11: Farklı key'ler birbirinden bağımsız (API endpoint ayrımı)
 */

import { checkRateLimit, resetRateLimitStore } from './rateLimit'

beforeEach(() => {
  resetRateLimitStore()
})

describe('checkRateLimit', () => {

  // T10 — Limit altı → geçer
  test('T10 — max dolmadan her istek allowed:true döner', () => {
    const config = { windowMs: 60_000, max: 3 }

    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit('test-key', config)
      expect(result.allowed).toBe(true)
      expect(result.retryAfterMs).toBe(0)
    }
  })

  // T9 — Limit aşımı → reddedilir
  test('T9 — max+1. istek allowed:false, retryAfterMs > 0', () => {
    const config = { windowMs: 60_000, max: 3 }

    // 3 izin verilen istek
    for (let i = 0; i < 3; i++) {
      checkRateLimit('test-key', config)
    }

    // 4. istek → limit aşıldı
    const result = checkRateLimit('test-key', config)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000)
  })

  // T11a — Farklı key'ler bağımsız (login vs upload vs scenario)
  test('T11a — login ve upload key\'leri birbirinden bağımsız sayılır', () => {
    const loginConfig    = { windowMs: 60_000, max: 1 }
    const uploadConfig   = { windowMs: 60_000, max: 1 }

    // login max'ını doldur
    checkRateLimit('login:1.2.3.4',  loginConfig)
    const loginBlocked = checkRateLimit('login:1.2.3.4',  loginConfig)
    expect(loginBlocked.allowed).toBe(false)

    // upload aynı IP'de hâlâ serbest
    const uploadAllowed = checkRateLimit('upload:1.2.3.4', uploadConfig)
    expect(uploadAllowed.allowed).toBe(true)
  })

  // T11b — Farklı IP'ler bağımsız
  test('T11b — Farklı IP\'ler aynı endpoint\'te bağımsız sayılır', () => {
    const config = { windowMs: 60_000, max: 1 }

    checkRateLimit('login:1.1.1.1', config)
    const ip1Blocked = checkRateLimit('login:1.1.1.1', config)
    expect(ip1Blocked.allowed).toBe(false)

    // Farklı IP serbest
    const ip2Allowed = checkRateLimit('login:2.2.2.2', config)
    expect(ip2Allowed.allowed).toBe(true)
  })

  // T11c — Pencere sıfırlandıktan sonra yeniden geçer (API matcher kapsam testi)
  test('T11c — windowMs geçince pencere sıfırlanır, istek geçer', () => {
    const config = { windowMs: 1, max: 1 }  // 1ms pencere

    checkRateLimit('scenario:1.2.3.4', config)   // max doldur
    const blocked = checkRateLimit('scenario:1.2.3.4', config)
    expect(blocked.allowed).toBe(false)

    // 2ms bekle — pencere biter
    return new Promise<void>(resolve => setTimeout(() => {
      const result = checkRateLimit('scenario:1.2.3.4', config)
      expect(result.allowed).toBe(true)
      resolve()
    }, 2))
  })

})
