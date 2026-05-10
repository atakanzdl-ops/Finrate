import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { createVerificationToken } from '@/lib/verification'
import { sendMail } from '@/lib/email'
import { buildVerifyEmail } from '@/lib/email-templates/verify-email'

const COOLDOWN_MS = 60 * 1000 // 60 saniye

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email } = body

    if (!email) {
      return jsonUtf8({ error: 'E-posta zorunludur.' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      // Bulgu 3: email enumeration'ı önle — sessiz başarı (mail gitmez)
      return jsonUtf8({ ok: true })
    }

    if (user.isVerified) {
      return jsonUtf8({ error: 'Bu hesap zaten doğrulanmış.' }, { status: 400 })
    }

    // Cooldown kontrolü — son token 60sn içinde oluşturulduysa beklet
    const lastToken = await prisma.verificationToken.findFirst({ where: { userId: user.id } })
    if (lastToken) {
      const elapsed = Date.now() - lastToken.createdAt.getTime()
      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000)
        return jsonUtf8(
          { error: `Lütfen ${remaining} saniye bekleyin.`, retryAfter: remaining },
          { status: 429 },
        )
      }
    }

    const { code } = await createVerificationToken(user.id)

    try {
      const { subject, html, text } = buildVerifyEmail({ code, fullName: user.fullName })
      await sendMail({ to: user.email, subject, html, text })
    } catch (mailErr) {
      console.error('[resend-code] mail gönderilemedi:', mailErr)
      return jsonUtf8({ error: 'Mail gönderilemedi. Lütfen tekrar deneyin.' }, { status: 500 })
    }

    return jsonUtf8({ ok: true })
  } catch (err) {
    console.error('[resend-code] hata:', err)
    return jsonUtf8({ error: 'Sunucu hatası. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
