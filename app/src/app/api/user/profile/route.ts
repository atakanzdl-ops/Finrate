import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

export async function PATCH(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

    const { fullName, companyName } = await req.json()

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName    && { fullName: fullName.trim() }),
        ...(companyName !== undefined && { companyName: companyName?.trim() || null }),
      },
      select: { id: true, email: true, fullName: true, companyName: true },
    })

    return NextResponse.json({ user })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
