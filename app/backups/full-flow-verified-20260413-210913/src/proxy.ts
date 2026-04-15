import { NextRequest, NextResponse } from 'next/server'

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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get('finrate_token')?.value

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
  matcher: ['/dashboard/:path*', '/giris', '/kayit'],
}
