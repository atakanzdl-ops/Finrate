import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { signToken } from '@/lib/auth'
import { consumeToken } from '@/lib/verification'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, code } = body

    if (!email || !code) {
      return jsonUtf8({ error: 'E-posta ve kod zorunludur.' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      // Bulgu 3: email enumeration'ı önle — gerçek hata mesajı verme
      return jsonUtf8({ error: 'Kod hatalı veya süresi dolmuş.' }, { status: 400 })
    }

    if (user.isVerified) {
      // Zaten doğrulanmış — kod kontrolü yapılmadan JWT atılmaz (Bulgu 2)
      return jsonUtf8(
        { error: 'Bu hesap zaten doğrulanmış. Lütfen giriş yapın.', alreadyVerified: true },
        { status: 400 },
      )
    }

    const result = await consumeToken(user.id, String(code))
    if (!result.ok) {
      return jsonUtf8({ error: result.error }, { status: 400 })
    }

    // Doğrulama başarılı
    await prisma.user.update({
      where: { id: user.id },
      data:  { isVerified: true },
    })

    const token = signToken({ userId: user.id, email: user.email, role: user.role })
    const response = jsonUtf8({ ok: true, redirect: '/dashboard' })
    response.cookies.set('finrate_token', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 7,
      path:     '/',
    })
    return response
  } catch (err) {
    console.error('[verify-email] hata:', err)
    return jsonUtf8({ error: 'Sunucu hatası. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
