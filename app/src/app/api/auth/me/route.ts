import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('finrate_token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Oturum açılmamış.' }, { status: 401 })
    }

    const payload = verifyToken(token)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        companyName: true,
        role: true,
        isVerified: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            currentPeriodEnd: true,
            billingCycle: true,
          },
        },
      },
    })

    if (!user || !user) {
      return NextResponse.json({ error: 'Kullanıcı bulunamadı.' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch {
    return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  }
}
