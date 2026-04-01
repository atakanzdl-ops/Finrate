import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

// Giriş gerektiren route'lar
const PROTECTED = ['/dashboard', '/analiz', '/sirketler', '/gruplar', '/ayarlar']
// Giriş yapmış kullanıcının görmemesi gereken sayfalar
const AUTH_PAGES = ['/giris', '/kayit']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get('finrate_token')?.value

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  const isAuthPage  = AUTH_PAGES.some((p) => pathname.startsWith(p))

  if (isProtected) {
    if (!token) {
      return NextResponse.redirect(new URL('/giris', req.url))
    }
    try {
      verifyToken(token)
    } catch {
      const res = NextResponse.redirect(new URL('/giris', req.url))
      res.cookies.set('finrate_token', '', { maxAge: 0, path: '/' })
      return res
    }
  }

  if (isAuthPage && token) {
    try {
      verifyToken(token)
      return NextResponse.redirect(new URL('/dashboard', req.url))
    } catch {
      // Token geçersiz — auth sayfasına izin ver
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/analiz/:path*', '/sirketler/:path*', '/gruplar/:path*', '/ayarlar/:path*', '/giris', '/kayit'],
}
