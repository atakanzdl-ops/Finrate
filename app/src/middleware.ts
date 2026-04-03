import { NextRequest, NextResponse } from 'next/server'

// Edge Runtime'da jsonwebtoken çalışmaz — JWT'yi elle decode ediyoruz
function isTokenValid(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1]))
    // exp kontrolü (saniye cinsinden)
    if (payload.exp && payload.exp < Date.now() / 1000) return false
    return !!payload.userId
  } catch {
    return false
  }
}

const PROTECTED = ['/dashboard']
const AUTH_PAGES = ['/giris', '/kayit']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get('finrate_token')?.value

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  const isAuthPage  = AUTH_PAGES.some((p) => pathname.startsWith(p))

  // Korumalı sayfa + geçersiz token → giriş sayfasına
  if (isProtected && token && !isTokenValid(token)) {
    const res = NextResponse.redirect(new URL('/giris', req.url))
    res.cookies.set('finrate_token', '', { maxAge: 0, path: '/' })
    return res
  }

  // Korumalı sayfa + token yok → giriş sayfasına
  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/giris', req.url))
  }

  // Auth sayfası + geçerli token → dashboard'a
  if (isAuthPage && token && isTokenValid(token)) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/giris', '/kayit'],
}
