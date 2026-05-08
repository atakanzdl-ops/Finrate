/**
 * rateLimit.ts — In-memory rate limiter (Faz 7.3.49)
 *
 * Sliding-window sayaç. Key başına windowMs penceresi içinde
 * max isteğe kadar geçişe izin verir.
 *
 * NOT: Vercel serverless/edge'de her instance bağımsız sayaç tutar.
 *      Kapalı beta (5 kullanıcı) için bu yeterli.
 *      Açık lansman öncesi Vercel KV / Upstash migration gerekli — Faz 7.3.50+
 *
 * Pure helper — test edilebilir export.
 */

interface RateLimitEntry {
  count:       number
  windowStart: number
}

const store = new Map<string, RateLimitEntry>()

export interface RateLimitConfig {
  /** Pencere süresi (ms) — genellikle 60_000 (1 dk) */
  windowMs: number
  /** İzin verilen maksimum istek sayısı pencere içinde */
  max:      number
}

/**
 * Verilen key için rate limit kontrolü.
 *
 * @returns `{ allowed: true  }` — geçebilir, retryAfterMs = 0
 *          `{ allowed: false }` — limit aşıldı, retryAfterMs ms bekle
 */
export function checkRateLimit(
  key:    string,
  config: RateLimitConfig,
): { allowed: boolean; retryAfterMs: number } {
  const now   = Date.now()
  const entry = store.get(key)

  // Yeni pencere veya ilk istek
  if (!entry || now - entry.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now })
    return { allowed: true, retryAfterMs: 0 }
  }

  // Pencere dolmamış, limit altında
  if (entry.count < config.max) {
    entry.count++
    return { allowed: true, retryAfterMs: 0 }
  }

  // Limit aşıldı
  const retryAfterMs = config.windowMs - (now - entry.windowStart)
  return { allowed: false, retryAfterMs }
}

/** Test ortamında store'u sıfırla */
export function resetRateLimitStore(): void {
  store.clear()
}
