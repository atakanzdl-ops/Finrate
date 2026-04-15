import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest, comparePassword, hashPassword } from '@/lib/auth'

export async function PATCH(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req)
    if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

    const { currentPassword, newPassword } = await req.json()
    if (!currentPassword || !newPassword)   return jsonUtf8({ error: 'Zorunlu alanlar eksik.' }, { status: 400 })
    if (newPassword.length < 8)             return jsonUtf8({ error: 'Yeni şifre en az 8 karakter olmalı.' }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return jsonUtf8({ error: 'Kullanıcı bulunamadı.' }, { status: 404 })

    const valid = await comparePassword(currentPassword, user.passwordHash)
    if (!valid) return jsonUtf8({ error: 'Mevcut şifre hatalı.' }, { status: 400 })

    const passwordHash = await hashPassword(newPassword)
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

    return jsonUtf8({ success: true })
  } catch {
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
