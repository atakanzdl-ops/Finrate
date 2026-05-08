import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit }            from './lib/rateLimit'

// Edge Runtime'da jsonwebtoken çalışmaz.
// Web Crypto API ile HMAC-SHA256 imza doğrulaması yapıyoruz.
async function isTokenValid(token: string): Promise<boolean> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false

    const [headerB64, payloadB64, signatureB64] = parts

    // 1. İmzayı doğrula
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET environment variable is not set.')
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify']
    )
    // JWT imzası: base64url(HMAC-SHA256(header.payload))
    const signingInput = encoder.encode(`${headerB64}.${payloadB64}`)
    // base64url → base64 dönüşümü
    const b64 = signatureB64.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      signatureB64.length + (4 - signatureB64.length % 4) % 4, '='
    )
    const sigBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, signingInput)
    if (!valid) return false

    // 2. Payload'u decode et ve exp + userId kontrol et
    const payload = JSON.parse(atob(
      payloadB64.replace(/-/g, '+').replace(/_/g, '/').padEnd(
        payloadB64.length + (4 - payloadB64.length % 4) % 4, '='
      )
    ))
    if (payload.exp && payload.exp < Date.now() / 1000) return false
    return !!payload.userId
  } catch {
    return false
  }
}

const PROTECTED = ['/dashboard']
const AUTH_PAGES = ['/giris', '/kayit']

// ─── Rate limit (Faz 7.3.49) ─────────────────────────────────────────────────
// Faz 7.3.49: In-memory (kapalı beta). Açık lansman öncesi Vercel KV / Upstash
// migration gerekli — Faz 7.3.50+

const RATE_CONFIGS = {
  login:    { windowMs: 60_000, max: 5  },  // /api/auth/login
  upload:   { windowMs: 60_000, max: 10 },  // /api/entities/.../upload
  scenario: { windowMs: 60_000, max: 20 },  // /api/scenarios/v3
} as const

function getRateLimitKey(
  pathname: string,
  req:      NextRequest,
): { key: string; config: { windowMs: number; max: number } } | null {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip')                              ??
    'unknown'

  if (pathname === '/api/auth/login')   return { key: `login:${ip}`,    config: RATE_CONFIGS.login    }
  if (pathname.includes('/upload'))     return { key: `upload:${ip}`,   config: RATE_CONFIGS.upload   }
  if (pathname === '/api/scenarios/v3') return { key: `scenario:${ip}`, config: RATE_CONFIGS.scenario }
  return null
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get('finrate_token')?.value

  // ─── Rate limit kontrolü ───────────────────────────────────────────────────
  const rl = getRateLimitKey(pathname, req)
  if (rl) {
    const { allowed, retryAfterMs } = checkRateLimit(rl.key, rl.config)
    if (!allowed) {
      return new NextResponse(
        JSON.stringify({ error: 'Çok fazla istek. Lütfen bekleyin.' }),
        {
          status:  429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After':  String(Math.ceil(retryAfterMs / 1000)),
          },
        },
      )
    }
  }

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  const isAuthPage  = AUTH_PAGES.some((p) => pathname.startsWith(p))

  // Korumalı sayfa + geçersiz/sahte token → giriş sayfasına, cookie temizle
  if (isProtected && token && !(await isTokenValid(token))) {
    const res = NextResponse.redirect(new URL('/giris', req.url))
    res.cookies.set('finrate_token', '', { maxAge: 0, path: '/' })
    return res
  }

  // Korumalı sayfa + token yok → giriş sayfasına
  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/giris', req.url))
  }

  // Auth sayfası + geçerli token → dashboard'a
  if (isAuthPage && token && (await isTokenValid(token))) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/giris',
    '/kayit',
    '/api/auth/login',
    '/api/entities/:path*/upload',
    '/api/scenarios/v3',
  ],
}
