import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest, comparePassword, hashPassword } from '@/lib/auth'
import { sendMail } from '@/lib/email'
import { buildPasswordChangedEmail } from '@/lib/email-templates/password-changed'

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

    const passwordHash    = await hashPassword(newPassword)
    const passwordChangedAt = new Date()

    await prisma.user.update({
      where: { id: userId },
      data:  { passwordHash, passwordChangedAt },
    })

    // Bilgi maili gönder — hata olsa bile işlemi geri alma (non-critical)
    try {
      const { subject, html, text } = buildPasswordChangedEmail({
        fullName:  user.fullName,
        changedAt: passwordChangedAt,
      })
      await sendMail({ to: user.email, subject, html, text })
    } catch (mailErr) {
      console.error('[user/password] bilgi maili gönderilemedi:', mailErr)
    }

    return jsonUtf8({ ok: true })
  } catch {
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
