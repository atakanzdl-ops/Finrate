import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { hashPassword, signToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, fullName, companyName, plan } = body

    if (!email || !password || !fullName) {
      return jsonUtf8({ error: 'E-posta, şifre ve ad soyad zorunludur.' }, { status: 400 })
    }
    if (password.length < 8) {
      return jsonUtf8({ error: 'Şifre en az 8 karakter olmalıdır.' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return jsonUtf8({ error: 'Bu e-posta adresi zaten kayıtlı.' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)

    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setDate(periodEnd.getDate() + 14) // 14 günlük deneme

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        companyName: companyName ?? null,
        subscription: {
          create: {
            plan: plan === 'STANDART' ? 'STANDART' : plan === 'PRO' ? 'PRO' : 'DEMO',
            billingCycle: 'MONTHLY',
            status: plan === 'DEMO' ? 'ACTIVE' : 'TRIALING',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        subscription: { select: { plan: true, status: true } },
      },
    })

    const token = signToken({ userId: user.id, email: user.email, role: user.role })

    const response = jsonUtf8({ user }, { status: 201 })
    response.cookies.set('finrate_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 gün
      path: '/',
    })

    return response
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[register] error:', msg)
    return jsonUtf8({ error: 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
