import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest, comparePassword, hashPassword } from '@/lib/auth'

export async function PATCH(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req)
    if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

    const { currentPassword, newPassword } = await req.json()
    if (!currentPassword || !newPassword)   return NextResponse.json({ error: 'Zorunlu alanlar eksik.' }, { status: 400 })
    if (newPassword.length < 8)             return NextResponse.json({ error: 'Yeni şifre en az 8 karakter olmalı.' }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: 'Kullanıcı bulunamadı.' }, { status: 404 })

    const valid = await comparePassword(currentPassword, user.passwordHash)
    if (!valid) return NextResponse.json({ error: 'Mevcut şifre hatalı.' }, { status: 400 })

    const passwordHash = await hashPassword(newPassword)
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
