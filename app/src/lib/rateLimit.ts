/**
 * rateLimit.ts — Upstash Redis rate limiter (Faz 7.5.3)
 *
 * Sliding-window sayaç. Upstash Redis REST API üzerinden shared store.
 * Tüm Vercel serverless instance'ları aynı sayaçları görür.
 *
 * ENV VARS (Vercel'de tanımlı):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Fail-open: Upstash erişilemezse site çalışmaya devam eder,
 * rate limit sessizce pas geçer.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'

const redis = Redis.fromEnv()

// ─── Named limiter'lar ────────────────────────────────────────────────────────

/** Login: 5 istek / dakika */
export const loginRateLimit = new Ratelimit({
  redis,
  limiter:   Ratelimit.slidingWindow(5, '1 m'),
  analytics: true,
  prefix:    'finrate:rl:login',
})

/** Upload: 10 istek / dakika */
export const uploadRateLimit = new Ratelimit({
  redis,
  limiter:   Ratelimit.slidingWindow(10, '1 m'),
  analytics: true,
  prefix:    'finrate:rl:upload',
})

/** Genel (scenario vb.): 60 istek / dakika */
export const generalRateLimit = new Ratelimit({
  redis,
  limiter:   Ratelimit.slidingWindow(60, '1 m'),
  analytics: true,
  prefix:    'finrate:rl:general',
})

// ─── Geriye uyumlu tip (middleware.ts RATE_CONFIGS ile uyum) ─────────────────

export interface RateLimitConfig {
  /** Pencere süresi (ms) */
  windowMs: number
  /** İzin verilen maksimum istek sayısı */
  max: number
}

// ─── Wrapper (middleware.ts imzasını bozmaz) ──────────────────────────────────

/**
 * Verilen key için rate limit kontrolü.
 *
 * config.max ≤ 5  → loginRateLimit
 * config.max ≤ 10 → uploadRateLimit
 * diğer           → generalRateLimit
 *
 * @returns `{ allowed: true  }` — geçebilir, retryAfterMs = 0
 *          `{ allowed: false }` — limit aşıldı, retryAfterMs ms bekle
 */
export async function checkRateLimit(
  key:    string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const limiter =
    config.max <= 5  ? loginRateLimit  :
    config.max <= 10 ? uploadRateLimit :
                       generalRateLimit

  try {
    const result = await limiter.limit(key)
    return {
      allowed:      result.success,
      retryAfterMs: result.success ? 0 : Math.max(0, result.reset - Date.now()),
    }
  } catch (e) {
    // Fail-open: Upstash erişilemezse site çalışmaya devam etsin
    console.error('[rateLimit] Upstash error:', e instanceof Error ? e.message : e)
    return { allowed: true, retryAfterMs: 0 }
  }
}
