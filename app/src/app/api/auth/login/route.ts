import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { comparePassword, signToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return jsonUtf8({ error: 'E-posta ve şifre zorunludur.' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { subscription: { select: { plan: true, status: true } } },
    })

    if (!user) {
      return jsonUtf8({ error: 'E-posta veya şifre hatalı.' }, { status: 401 })
    }

    if (!user.isActive) {
      return jsonUtf8({ error: 'Hesabınız askıya alınmıştır.' }, { status: 403 })
    }

    const valid = await comparePassword(password, user.passwordHash)
    if (!valid) {
      return jsonUtf8({ error: 'E-posta veya şifre hatalı.' }, { status: 401 })
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role })

    const response = jsonUtf8({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        subscription: user.subscription,
      },
    })
    response.cookies.set('finrate_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return response
  } catch {
    return jsonUtf8({ error: 'Sunucu hatası. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
