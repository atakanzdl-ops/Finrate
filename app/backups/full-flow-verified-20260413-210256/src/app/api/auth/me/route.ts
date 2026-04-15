import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req)
    if (!userId) {
      return jsonUtf8({ error: 'Oturum açılmamış.' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    if (!user) {
      return jsonUtf8({ error: 'Kullanıcı bulunamadı.' }, { status: 404 })
    }

    return jsonUtf8({ user })
  } catch {
    return jsonUtf8({ error: 'Oturum geçersiz.' }, { status: 401 })
  }
}
