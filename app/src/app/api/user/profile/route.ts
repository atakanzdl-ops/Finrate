import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

export async function PATCH(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req)
    if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

    const { fullName, companyName } = await req.json()

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName    && { fullName: fullName.trim() }),
        ...(companyName !== undefined && { companyName: companyName?.trim() || null }),
      },
      select: { id: true, email: true, fullName: true, companyName: true },
    })

    return jsonUtf8({ user })
  } catch {
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
