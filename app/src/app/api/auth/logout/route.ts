import { NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'

function clearCookie(res: NextResponse) {
  res.cookies.set('finrate_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return res
}

export async function POST() {
  return clearCookie(jsonUtf8({ success: true }))
}

// GET ile tarayıcıdan direkt çağrılabilsin → /giris'e yönlendir
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/giris', req.url))
  res.cookies.set('finrate_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return res
}
