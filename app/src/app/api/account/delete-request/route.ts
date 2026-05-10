import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { verifyTokenWithDb } from '@/lib/auth'
import { createDeletionToken } from '@/lib/account-deletion'
import { sendMail } from '@/lib/email'
import { buildDeleteAccountEmail } from '@/lib/email-templates/delete-account'

/**
 * POST /api/account/delete-request
 * Hesap silme OTP'si oluşturur ve kullanıcının mailine gönderir.
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('finrate_token')?.value
    if (!token) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

    const payload = await verifyTokenWithDb(token)
    if (!payload) {
      const res = jsonUtf8({ error: 'Oturum geçersiz.' }, { status: 401 })
      res.cookies.set('finrate_token', '', { maxAge: 0, path: '/' })
      return res
    }

    const userId = payload.userId

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, fullName: true, isActive: true },
    })

    if (!user)          return jsonUtf8({ error: 'Kullanıcı bulunamadı.' }, { status: 404 })
    if (!user.isActive) return jsonUtf8({ error: 'Hesap zaten kapalı.' },   { status: 400 })

    const { code } = await createDeletionToken(userId)

    try {
      const { subject, html, text } = buildDeleteAccountEmail({
        code,
        fullName: user.fullName,
      })
      await sendMail({ to: user.email, subject, html, text })
    } catch (mailErr) {
      console.error('[account/delete-request] mail gönderilemedi:', mailErr)
      return jsonUtf8({ error: 'Onay kodu gönderilemedi. Lütfen tekrar deneyin.' }, { status: 500 })
    }

    return jsonUtf8({ ok: true })
  } catch (err) {
    console.error('[account/delete-request] hata:', err)
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
