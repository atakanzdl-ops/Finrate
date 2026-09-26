import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { createVerificationToken } from '@/lib/verification'
import { sendMail } from '@/lib/email'
import { buildResetPasswordEmail } from '@/lib/email-templates/reset-password'

const COOLDOWN_MS = 60 * 1000 // 60 saniye — aynı hesaba art arda kod istenemez

/**
 * POST /api/auth/forgot-password — { email }
 * Kayıtlı hesaba 6 haneli şifre sıfırlama kodu gönderir.
 * E-posta kayıtlı değilse de "ok" döner (hesap var/yok bilgisi sızdırılmaz).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    if (!email) return jsonUtf8({ error: 'E-posta zorunludur.' }, { status: 400 })

    // Kayıtta büyük/küçük harf korunuyor → büyük/küçük harf duyarsız ara
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
    if (!user || !user.isActive) return jsonUtf8({ ok: true })

    const lastToken = await prisma.verificationToken.findFirst({ where: { userId: user.id } })
    if (lastToken) {
      const elapsed = Date.now() - lastToken.createdAt.getTime()
      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000)
        return jsonUtf8({ error: `Lütfen ${remaining} saniye bekleyin.`, retryAfter: remaining }, { status: 429 })
      }
    }

    const { code } = await createVerificationToken(user.id)
    try {
      const { subject, html, text } = buildResetPasswordEmail({ code, fullName: user.fullName })
      await sendMail({ to: user.email, subject, html, text })
    } catch (mailErr) {
      console.error('[forgot-password] mail gönderilemedi:', mailErr)
      return jsonUtf8({ error: 'Mail gönderilemedi. Lütfen tekrar deneyin.' }, { status: 500 })
    }

    return jsonUtf8({ ok: true })
  } catch (err) {
    console.error('[forgot-password] hata:', err)
    return jsonUtf8({ error: 'Sunucu hatası. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
