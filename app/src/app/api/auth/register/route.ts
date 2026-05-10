import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { createVerificationToken } from '@/lib/verification'
import { sendMail } from '@/lib/email'
import { buildVerifyEmail } from '@/lib/email-templates/verify-email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password, fullName, companyName, plan } = body

    if (!email || !password || !fullName) {
      return jsonUtf8({ error: 'E-posta, şifre ve ad soyad zorunludur.' }, { status: 400 })
    }
    if (password.length < 8) {
      return jsonUtf8({ error: 'Şifre en az 8 karakter olmalıdır.' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })

    // Zaten kayıtlı ve doğrulanmış → 409
    if (existing && existing.isVerified) {
      return jsonUtf8({ error: 'Bu e-posta adresi zaten kayıtlı.' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const now          = new Date()
    const periodEnd    = new Date(now)
    periodEnd.setDate(periodEnd.getDate() + 14)

    let user: { id: string; email: string; fullName: string; role: string }

    if (existing && !existing.isVerified) {
      // Kayıtlı ama doğrulanmamış — şifreyi güncelle, yeni kod gönder
      user = await prisma.user.update({
        where: { id: existing.id },
        data:  { passwordHash },
        select: { id: true, email: true, fullName: true, role: true },
      })
    } else {
      // Yeni kayıt
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          companyName: companyName ?? null,
          isVerified:  false,
          subscription: {
            create: {
              plan:               plan === 'STANDART' ? 'STANDART' : plan === 'PRO' ? 'PRO' : 'DEMO',
              billingCycle:       'MONTHLY',
              status:             plan === 'DEMO' ? 'ACTIVE' : 'TRIALING',
              currentPeriodStart: now,
              currentPeriodEnd:   periodEnd,
            },
          },
        },
        select: { id: true, email: true, fullName: true, role: true },
      })
    }

    // Doğrulama kodu oluştur
    const { code } = await createVerificationToken(user.id)

    // Mail gönder
    try {
      const { subject, html, text } = buildVerifyEmail({ code, fullName: user.fullName })
      await sendMail({ to: user.email, subject, html, text })
    } catch (mailErr) {
      console.error('[register] mail gönderilemedi:', mailErr)
      // Kullanıcı kayıtlı kalır — yeniden gönder akışı var
      return jsonUtf8(
        { error: 'Hesabınız oluşturuldu ancak doğrulama maili gönderilemedi. Lütfen giriş yapıp yeniden kod talep edin.' },
        { status: 500 },
      )
    }

    // JWT cookie YOK — önce doğrulama gerekli
    return jsonUtf8({ email: user.email, needsVerification: true }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[register] hata:', msg)
    return jsonUtf8({ error: 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
